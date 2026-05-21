# Observability Layer — Arquitetura

## Princípio

```txt
Instrumentar primeiro
Visualizar depois
Alertar depois
Automatizar resposta depois
```

Grafana, Zabbix e GLPI não substituem instrumentação interna.

## Objetivo

Permitir saber:

- onde falhou
- por que falhou
- qual componente falhou
- qual aluno/unidade/dispositivo foi afetado
- se foi erro técnico ou decisão de negócio
- se o payload chegou
- se o payload foi parseado
- se a credencial foi resolvida
- se a regra de acesso decidiu corretamente
- se o comando chegou ao dispositivo

## Correlation ID

Cada operação crítica deve ter um identificador único.

Exemplo:

```txt
correlation_id = acc_20260521_xxxxx
```

Esse ID deve acompanhar:

- request
- payload recebido
- normalização
- credential lookup
- decisão
- comando
- log final

## Pipeline de acesso físico

```txt
raw_payload_received
payload_parsed
event_normalized
credential_resolved
student_resolved
decision_evaluated
command_sent
command_acknowledged
attempt_logged
failed
```

## Catálogo de erros

### Rede/transporte

- DEVICE_OFFLINE
- CONNECTION_REFUSED
- TCP_TIMEOUT
- SERIAL_PORT_NOT_FOUND
- SERIAL_PERMISSION_DENIED
- SDK_NOT_AVAILABLE
- GATEWAY_OFFLINE
- DNS_ERROR
- TLS_ERROR

### Protocolo/payload

- PROTOCOL_PARSE_ERROR
- INVALID_PAYLOAD_FORMAT
- MISSING_REQUIRED_FIELD
- UNKNOWN_EVENT_TYPE
- UNSUPPORTED_DEVICE_MODEL
- UNSUPPORTED_FIRMWARE_VERSION
- CHECKSUM_INVALID
- ENCODING_ERROR

### Normalização

- PROVIDER_MAPPING_ERROR
- UNKNOWN_CREDENTIAL_METHOD
- DEVICE_NOT_REGISTERED
- UNIT_NOT_RESOLVED
- INVALID_PROVIDER_CONFIG

### Segurança

- UNAUTHORIZED_DEVICE
- INVALID_DEVICE_SECRET
- REPLAY_DETECTED
- SIGNATURE_INVALID
- CLOCK_SKEW_TOO_HIGH
- RATE_LIMITED
- IP_NOT_ALLOWED

### Credencial/aluno

- CREDENTIAL_NOT_FOUND
- CREDENTIAL_REVOKED
- CREDENTIAL_INACTIVE
- STUDENT_NOT_FOUND
- STUDENT_INACTIVE

### Decisão de negócio

- BLOCKED_OVERDUE
- BLOCKED_NO_ACTIVE_SUBSCRIPTION
- BLOCKED_MANUAL
- BLOCKED_PENDING
- BLOCKED_UNIT_SCOPE
- ALLOWED
- ALLOWED_MANUAL_OVERRIDE

### Banco/sistema

- DB_ERROR
- TRANSACTION_FAILED
- LOCK_TIMEOUT
- INTERNAL_ERROR
- CONFIG_ERROR

### Comando de saída

- COMMAND_SEND_FAILED
- COMMAND_TIMEOUT
- COMMAND_REJECTED_BY_DEVICE
- TURNSTILE_NOT_ACKED
- DEVICE_BUSY

## Tabelas futuras

### integration_events

- id
- correlation_id
- event_type
- stage
- provider
- device_id
- severity
- message
- error_code
- latency_ms
- metadata_json
- created_at

### device_health

- id
- device_id
- status
- last_seen_at
- last_success_at
- last_error_at
- last_error_code
- latency_ms
- firmware_version
- metadata_json
- updated_at

### device_protocol_transactions

- id
- correlation_id
- device_id
- provider
- direction
- payload_hash
- payload_redacted
- status
- error_code
- created_at

### gateway_heartbeats

- id
- gateway_id
- unit_id
- version
- status
- last_seen_at
- devices_json
- metadata_json

## Dashboard interno antes de Grafana

Primeiro criar telas internas:

### Monitor de API

- status
- uptime
- versão
- latência
- últimos erros críticos

### Monitor de Acesso

- horário
- aluno
- unidade
- dispositivo
- método
- decisão
- motivo
- correlation_id
- latência

### Monitor de Dispositivos

- status online/offline
- provider
- modelo
- unidade
- último heartbeat
- último erro
- latência
- contadores de falha

## Ferramentas externas futuras

### Grafana

Para dashboards técnicos e operacionais.

### Prometheus

Para métricas numéricas e alertas.

### Loki/Sentry

Para logs centralizados e erros.

### Zabbix

Para rede, host, ping, portas e dispositivos em ambiente físico real.

### GLPI

Para inventário, chamados e manutenção quando houver operação multi-cliente.

## Decisão

Agora:

```txt
correlation_id
logs estruturados
catálogo de erros
healthcheck
monitor interno
eventos técnicos
```

Depois:

```txt
Prometheus
Grafana
Loki
Sentry
Zabbix
GLPI
```
