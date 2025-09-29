from django.urls import path
from .views import habitaciones_disponibles, crear_reserva, montos_reserva

urlpatterns = [
    path('habitaciones/disponibles', habitaciones_disponibles),
    path('reservas', crear_reserva),
    path('reservas/<int:reserva_id>/montos', montos_reserva),  # opcional
]
