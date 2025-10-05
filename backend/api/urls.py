# backend/api/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # AUTH
    path('auth/register', views.register, name='auth-register'),
    path('auth/login',    views.login,    name='auth-login'),
    path('auth/me',       views.me,       name='auth-me'),

    # API PRINCIPAL
    path('habitaciones/disponibles', views.habitaciones_disponibles),
    path('reservas', views.crear_reserva),
    path('reservas/<int:reserva_id>/montos', views.montos_reserva),
]
