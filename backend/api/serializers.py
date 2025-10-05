# backend/api/serializers.py
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    confirm  = serializers.CharField(write_only=True)

    class Meta:
        model  = User
        fields = ("username", "email", "password", "confirm", "first_name", "last_name")
        extra_kwargs = {
            "username": {"required": False},  # usaremos email como username
        }

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        if not email:
            raise serializers.ValidationError({"email": "Correo requerido."})
        attrs["email"] = email

        # email como username
        attrs["username"] = email

        if attrs["password"] != attrs["confirm"]:
            raise serializers.ValidationError({"confirm": "Las contraseñas no coinciden."})

        validate_password(attrs["password"])
        return attrs

    def create(self, validated):
        pwd = validated.pop("password")
        validated.pop("confirm", None)
        user = User.objects.create(**validated)
        user.set_password(pwd)
        user.is_active = True
        user.save()
        return user


class MeSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ("id", "email", "first_name", "last_name", "is_active", "date_joined")
