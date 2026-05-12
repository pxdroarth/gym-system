# Testes de Carga com k6

k6 será usado futuramente para carga e performance de API.

Ele não será instalado nesta sprint, e não será criado teste de carga real enquanto não houver massa estável e critérios mínimos de ambiente.

## Cenários futuros

- carga em `/auth/login`
- carga em `/auth/me`
- carga em `/alunos`
- carga em `/pagamentos`
- carga em `/audit-logs` com perfil autorizado

## Comando futuro

```bash
k6 run tests/k6/auth-load.js
```

Status: pendente.
