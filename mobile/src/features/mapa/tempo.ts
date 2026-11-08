/** Tempo relativo e hora (pt-BR), em funções puras para facilitar o teste. */

const MINUTO_MS = 60_000;
const HORA_MS = 3_600_000;
const DIA_MS = 86_400_000;

/** "agora", "há 5 min", "há 2 h", "há 3 dias" (injetar `agora` nos testes). */
export function tempoRelativo(iso: string, agora: Date = new Date()): string {
  const delta = agora.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < MINUTO_MS) {
    return 'agora';
  }

  const minutos = Math.floor(delta / MINUTO_MS);
  if (minutos < 60) {
    return `há ${minutos} min`;
  }

  const horas = Math.floor(delta / HORA_MS);
  if (horas < 24) {
    return `há ${horas} h`;
  }

  const dias = Math.floor(delta / DIA_MS);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** "12:08" (HH:mm, 24 h). */
export function horaMinuto(iso: string): string {
  const data = new Date(iso);
  const horas = String(data.getHours()).padStart(2, '0');
  const minutos = String(data.getMinutes()).padStart(2, '0');
  return `${horas}:${minutos}`;
}
