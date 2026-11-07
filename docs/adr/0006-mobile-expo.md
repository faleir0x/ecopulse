# ADR 0006: React Native com Expo, offline-first com SQLite

**Status:** aceito

## Contexto
A proposta aceita Flutter ou React Native com SQLite local. O laptop da equipe não suporta Android Studio + SDK + emulador.

## Decisão
React Native em TypeScript com o framework Expo (recomendado pela documentação oficial do React Native), testado no celular via Expo Go. SQLite com `expo-sqlite`.

## Consequências
- Sem necessidade de Android SDK local.
- Alguns recursos nativos são limitados no Expo Go (ver ADR 0007).
- `npx expo prebuild` gera um projeto React Native comum se for necessário.
