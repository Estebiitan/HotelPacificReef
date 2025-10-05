from datetime import date, datetime
from typing import Optional

from django.db import connection, transaction, IntegrityError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken


# ---------------------------
# Helpers
# ---------------------------
def dictfetchall(cur):
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]

def parse_iso_date(s: Optional[str], field: str):
    if not s:
        raise ValueError(f"El campo '{field}' es obligatorio.")
    try:
        # Permite 'YYYY-MM-DD'
        return date.fromisoformat(s)
    except Exception:
        raise ValueError(f"El campo '{field}' debe tener formato YYYY-MM-DD.")

def parse_int(s: Optional[str], field: str):
    if s is None or s == "":
        raise ValueError(f"El campo '{field}' es obligatorio.")
    try:
        return int(s)
    except Exception:
        raise ValueError(f"El campo '{field}' debe ser numérico.")
    
def get_or_create_cliente_for_user(user: User) -> int:
    """
    Busca/crea un cliente en hotelreef.cliente asociado al auth_user.
    Devuelve cliente_id.
    """
    with connection.cursor() as cur:
        # ¿existe por user_id?
        cur.execute("SELECT cliente_id FROM hotelreef.cliente WHERE user_id = %s", [user.id])
        row = cur.fetchone()
        if row:
            return row[0]

        # ¿existe por correo (case-insensitive)?
        cur.execute("""
            SELECT cliente_id FROM hotelreef.cliente
            WHERE lower(correo) = lower(%s)
        """, [user.email or user.username])
        row = cur.fetchone()
        if row:
            cliente_id = row[0]
            cur.execute("UPDATE hotelreef.cliente SET user_id = %s WHERE cliente_id = %s", [user.id, cliente_id])
            return cliente_id

        # crear uno nuevo
        nombre   = user.first_name or 'Usuario'
        apellido = user.last_name or ''
        correo   = user.email or user.username
        cur.execute("""
            INSERT INTO hotelreef.cliente (nombre, apellido, correo, user_id)
            VALUES (%s, %s, %s, %s)
            RETURNING cliente_id
        """, [nombre, apellido, correo, user.id])
        return cur.fetchone()[0]


# ==========================================================
# Disponibilidad: GET /api/habitaciones/disponibles?entrada=...&salida=...[&hotel_id=...]
# ==========================================================
@api_view(['GET'])
@permission_classes([AllowAny])
def habitaciones_disponibles(request):
    entrada_raw = request.GET.get('entrada')
    salida_raw  = request.GET.get('salida')
    hotel_id_raw = request.GET.get('hotel_id')  # opcional

    try:
        entrada = parse_iso_date(entrada_raw, "entrada")
        salida  = parse_iso_date(salida_raw,  "salida")
        if salida <= entrada:
            return Response(
                {"detail": "La fecha de salida debe ser posterior a la de entrada."},
                status=status.HTTP_400_BAD_REQUEST
            )
        hotel_id = None
        if hotel_id_raw not in (None, "", "null"):
            hotel_id = parse_int(hotel_id_raw, "hotel_id")

        with connection.cursor() as cur:
            if hotel_id is not None:
                cur.execute("""
                    SELECT *
                    FROM hotelreef.fn_habitaciones_disponibles(%s::date, %s::date, %s::bigint)
                """, [entrada, salida, hotel_id])
            else:
                cur.execute("""
                    SELECT *
                    FROM hotelreef.fn_habitaciones_disponibles(%s::date, %s::date, NULL::bigint)
                """, [entrada, salida])

            data = dictfetchall(cur)

        return Response(data, status=status.HTTP_200_OK)

    except ValueError as ve:
        return Response({"detail": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response(
            {'detail': 'Error consultando disponibilidad', 'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ==========================================================
# Crear reserva: POST /api/reservas
# Body: {cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas}
# ==========================================================
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def crear_reserva(request):
    body = request.data
    user = request.user
    cliente_id = get_or_create_cliente_for_user(user)

    try:
        habitacion_id     = parse_int(body.get('habitacion_id'), 'habitacion_id')
        cantidad_personas = parse_int(body.get('cantidad_personas'), 'cantidad_personas')
        if cantidad_personas <= 0:
            return Response({'detail': 'cantidad_personas debe ser > 0.'}, status=400)

        fecha_entrada = parse_iso_date(body.get('fecha_entrada'), 'fecha_entrada')
        fecha_salida  = parse_iso_date(body.get('fecha_salida'), 'fecha_salida')

        if fecha_salida <= fecha_entrada:
            return Response({'detail': 'El rango de fechas es inválido (salida > entrada).'}, status=400)
        if fecha_entrada < date.today():
            return Response({'detail': 'La fecha de entrada no puede ser pasada.'}, status=400)

        # existencia
        with connection.cursor() as cur:
            cur.execute("SELECT EXISTS(SELECT 1 FROM hotelreef.habitacion WHERE habitacion_id=%s)", [habitacion_id])
            if not cur.fetchone()[0]:
                return Response({'detail': 'Habitación no encontrada.'}, status=404)

        # insertar
        with transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("""
                    INSERT INTO hotelreef.reserva
                      (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
                    VALUES (%s, %s, %s::date, %s::date, %s::int)
                    RETURNING reserva_id
                """, [cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas])
                rid = cur.fetchone()[0]
        return Response({'reserva_id': rid}, status=201)

    except IntegrityError as ie:
        msg = str(ie)
        if 'no_overlap_por_habitacion' in msg or 'overlap' in msg or '&&' in msg:
            return Response({'detail': 'La reserva se solapa con otra existente.'}, status=409)
        return Response({'detail': 'Error de integridad al crear la reserva.'}, status=400)
    except ValueError as ve:
        return Response({'detail': str(ve)}, status=400)
    except Exception as e:
        if 'capacidad' in str(e).lower():
            return Response({'detail': 'La cantidad de personas excede la capacidad de la habitación.'}, status=400)
        return Response({'detail': 'Error al crear la reserva.', 'error': str(e)}, status=500)



# ==========================================================
# Montos: GET /api/reservas/{id}/montos
# ==========================================================
@api_view(['GET'])
@permission_classes([AllowAny])
def montos_reserva(request, reserva_id: int):
    try:
        with connection.cursor() as cur:
            cur.execute("""
                SELECT *
                FROM hotelreef.vw_reserva_montos
                WHERE reserva_id = %s::bigint
            """, [reserva_id])
            data = dictfetchall(cur)

        if not data:
            return Response({'detail': 'Reserva no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(data[0], status=status.HTTP_200_OK)

    except Exception as e:
        return Response({'detail': 'Error consultando montos', 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# --- AUTH (agregar al inicio de views.py junto a los demás imports) ---
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken



# --- Helpers de token (agregar al final de views.py) ---
def _tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}

# POST /api/auth/register
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    confirm = request.data.get("confirm") or ""
    first_name = request.data.get("first_name") or request.data.get("nombre") or ""
    # concatena paterno+materno si vinieran separados
    last_name  = request.data.get("last_name") or (
        (request.data.get("apellido_paterno","") + " " + request.data.get("apellido_materno","")).strip()
    )

    if not email:
        return Response({"ok": False, "message": "Correo requerido."}, status=400)
    if password != confirm:
        return Response({"ok": False, "message": "Las contraseñas no coinciden."}, status=400)
    if len(password) < 6:
        return Response({"ok": False, "message": "La contraseña debe tener mínimo 6 caracteres."}, status=400)
    if User.objects.filter(username=email).exists():
        return Response({"ok": False, "message": "El correo ya está registrado."}, status=409)

    user = User.objects.create(
        username=email, email=email, first_name=first_name, last_name=last_name, is_active=True
    )
    user.set_password(password)
    user.save()

    cliente_id = get_or_create_cliente_for_user(user)
    return Response({"ok": True, "message": "Usuario creado", "cliente_id": cliente_id}, status=201)

# POST /api/auth/login
def _tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}

@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    user = authenticate(username=email, password=password)
    if not user:
        return Response({"ok": False, "message": "Credenciales inválidas"}, status=401)
    tokens = _tokens_for_user(user)
    cliente_id = get_or_create_cliente_for_user(user)
    return Response({"ok": True, "data": {"token": tokens["access"], "refresh": tokens["refresh"], "cliente_id": cliente_id}}, status=200)


# GET /api/auth/me
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    cid = get_or_create_cliente_for_user(u)
    return Response({
        "id": u.id,
        "email": u.email or u.username,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "cliente_id": cid,
        "is_active": u.is_active,
        "date_joined": u.date_joined,
    }, status=200)
