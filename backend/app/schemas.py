from uuid import UUID
from pydantic import BaseModel, Field


class RelatoIn(BaseModel):
    client_id: UUID                      # gerado no app, garante idempotência
    tipo: str = "alagamento"
    descricao: str | None = Field(default=None, max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
