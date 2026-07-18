#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-gulag-duel-rg}"
LOCATION="${LOCATION:-eastus}"
APP_NAME="${APP_NAME:-gulag-duel}"
ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-gulag-duel-env}"
ACR_NAME="${ACR_NAME:-gulagduel$RANDOM$RANDOM}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
az acr create --resource-group "$RESOURCE_GROUP" --name "$ACR_NAME" --sku Basic --admin-enabled true
az acr build --registry "$ACR_NAME" --image "$APP_NAME:$IMAGE_TAG" .

LOGIN_SERVER="$(az acr show --name "$ACR_NAME" --query loginServer --output tsv)"
IMAGE_NAME="$LOGIN_SERVER/$APP_NAME:$IMAGE_TAG"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file azure/main.bicep \
  --parameters acrName="$ACR_NAME" environmentName="$ENVIRONMENT_NAME" appName="$APP_NAME" imageName="$IMAGE_NAME"

az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name main \
  --query properties.outputs.appUrl.value \
  --output tsv
