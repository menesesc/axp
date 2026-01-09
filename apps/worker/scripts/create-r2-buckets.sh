#!/bin/bash

# Script para crear buckets R2 para cada cliente
# Uso: ./create-r2-buckets.sh

echo "🪣 Creando buckets R2 para clientes AXP..."
echo ""

# Verificar que AWS CLI está instalado
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI no encontrado. Instalalo con:"
    echo "   brew install awscli"
    exit 1
fi

# Verificar variables de entorno
if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
    echo "❌ Falta configurar variables de entorno:"
    echo ""
    echo "   export R2_ACCOUNT_ID=\"your-account-id\""
    echo "   export R2_ACCESS_KEY_ID=\"your-access-key\""
    echo "   export R2_SECRET_ACCESS_KEY=\"your-secret-key\""
    echo ""
    exit 1
fi

# Endpoint R2
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "✅ Configuración:"
echo "   Account ID: $R2_ACCOUNT_ID"
echo "   Endpoint: $ENDPOINT"
echo ""

# Lista de clientes (CUIT)
# Formato: "CUIT:NOMBRE"
CLIENTES=(
    "33712152449:Weiss"
    "20123456789:Acme"
    # Agregar más clientes aquí
)

echo "📋 Clientes a procesar: ${#CLIENTES[@]}"
echo ""

for cliente in "${CLIENTES[@]}"; do
    IFS=':' read -r cuit nombre <<< "$cliente"
    BUCKET="axp-client-${cuit}"
    
    echo "🔄 Procesando: $nombre (CUIT: $cuit)"
    echo "   Bucket: $BUCKET"
    
    # Verificar si el bucket ya existe
    if aws s3 ls "s3://${BUCKET}" \
        --endpoint-url="$ENDPOINT" \
        --region auto \
        2>/dev/null; then
        echo "   ⚠️  Bucket ya existe, saltando..."
    else
        # Crear bucket
        if aws s3 mb "s3://${BUCKET}" \
            --endpoint-url="$ENDPOINT" \
            --region auto; then
            echo "   ✅ Bucket creado exitosamente"
        else
            echo "   ❌ Error creando bucket"
        fi
    fi
    
    echo ""
done

echo "🎉 Proceso completado!"
echo ""
echo "📝 Siguiente paso: Actualizar prefix-map.json con estos buckets"
