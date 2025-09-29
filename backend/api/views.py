from django.db import connection, transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from datetime import date

def dictfetchall(cur):
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]

@api_view(['GET'])
def habitaciones_disponibles(request):
    entrada = request.GET.get('entrada')
    salida = request.GET.get('salida')
    hotel_id = request.GET.get('hotel_id')  # puede venir None

    if not entrada or not salida:
        return Response(
            {'detail': "Parámetros 'entrada' y 'salida' son obligatorios."},
            status=400
        )

    try:
        with connection.cursor() as cur:
            if hotel_id:
                # función en esquema hotelreef + casteos explícitos
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
        return Response(data, status=200)

    except Exception as e:
        return Response(
            {'detail': 'Error consultando disponibilidad', 'error': str(e)},
            status=500
        )

@api_view(['POST'])
def crear_reserva(request):
    body = request.data
    required = ['cliente_id', 'habitacion_id', 'fecha_entrada', 'fecha_salida', 'cantidad_personas']
    faltan = [k for k in required if k not in body]
    if faltan:
        return Response({'detail': f"Falta(n) campo(s): {', '.join(faltan)}"}, status=400)
    try:
        if body['fecha_entrada'] < str(date.today()):
            return Response({'detail': 'La fecha de entrada no puede ser pasada.'}, status=400)
        with transaction.atomic():
            with connection.cursor() as cur:
                cur.execute("""
                    INSERT INTO hotelreef.reserva
                      (cliente_id, habitacion_id, fecha_entrada, fecha_salida, cantidad_personas)
                    VALUES (%s, %s, %s::date, %s::date, %s::int)
                    RETURNING reserva_id
                """, [
                    body['cliente_id'], body['habitacion_id'],
                    body['fecha_entrada'], body['fecha_salida'],
                    body['cantidad_personas']
                ])
                rid = cur.fetchone()[0]
        return Response({'reserva_id': rid}, status=201)
    except Exception as e:
        msg = str(e)
        if 'overlap' in msg or 'no_overlap' in msg or 'excluir' in msg:
            return Response({'detail': 'La reserva se solapa con otra existente.'}, status=409)
        if 'capacidad' in msg:
            return Response({'detail': 'La cantidad de personas excede la capacidad de la habitación.'}, status=400)
        if 'fecha_salida > fecha_entrada' in msg or 'chk_rango' in msg:
            return Response({'detail': 'El rango de fechas es inválido.'}, status=400)
        return Response({'detail': 'Error al crear la reserva.', 'error': msg}, status=500)

@api_view(['GET'])
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
            return Response({'detail': 'Reserva no encontrada.'}, status=404)
        return Response(data[0], status=200)
    except Exception as e:
        return Response({'detail': 'Error consultando montos', 'error': str(e)}, status=500)
