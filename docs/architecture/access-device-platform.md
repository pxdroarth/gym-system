# Access Device Platform — Arquitetura

## Princípio

```txt
Dispositivo identifica
Backend decide
Atuador executa
Sistema registra
```

O hardware não deve conter a regra de negócio crítica.

## Universalização correta

Não se universaliza o protocolo bruto dos dispositivos.

Cada fabricante pode usar:

- HTTP
- TCP/IP
- serial
- USB
- SDK local
- polling
- webhook
- payload JSON
- payload texto
- payload binário

O que o sistema universaliza é o contrato interno:

```txt
raw payload externo
↓
Provider Adapter
↓
AccessIdentificationEvent
↓
CredentialResolver
↓
AccessDecisionService
↓
DeviceCommand
↓
Provider/Transport Adapter
```

## Contratos principais

### AccessIdentificationEvent

```ts
type AccessIdentificationEvent = {
  provider: string;
  deviceId: string;
  unitId?: string;
  method: 'face' | 'fingerprint' | 'card' | 'pin' | 'qrcode' | 'manual';
  externalIdentifier: string;
  occurredAt: string;
  rawPayloadRef?: string;
  metadata?: Record<string, unknown>;
};
```

### AccessDecision

```ts
type AccessDecision = {
  allowed: boolean;
  reasonCode:
    | 'ALLOWED'
    | 'ALLOWED_MANUAL_OVERRIDE'
    | 'BLOCKED_INACTIVE'
    | 'BLOCKED_NO_ACTIVE_SUBSCRIPTION'
    | 'BLOCKED_OVERDUE'
    | 'BLOCKED_MANUAL'
    | 'BLOCKED_PENDING'
    | 'BLOCKED_UNIT_SCOPE'
    | 'BLOCKED_UNKNOWN_CREDENTIAL'
    | 'BLOCKED_ERROR';
  reasonMessage: string;
  alunoId?: number;
  credentialId?: number;
  overrideId?: number;
};
```

### DeviceCommand

```ts
type DeviceCommand =
  | {
      type: 'OPEN_TURNSTILE';
      deviceId: string;
      reason: string;
    }
  | {
      type: 'DENY_ACCESS';
      deviceId: string;
      message: string;
    }
  | {
      type: 'SYNC_CREDENTIAL';
      deviceId: string;
      credentialId: string;
    };
```

## Provider Adapter

Provider conhece protocolo de fabricante.

Exemplos:

- SimulatorProvider
- ControlIdProvider
- TopdataProvider
- HenryProvider
- IntelbrasProvider

## Transport Adapter

Transport conhece meio de comunicação.

Exemplos:

- HTTP
- TCP socket
- Serial COM
- USB/SDK
- WebSocket
- Polling

## Regra de ouro

```txt
Provider conhece protocolo.
Domínio conhece regra de negócio.
Repository conhece banco.
UseCase orquestra.
```

## Entidades futuras

### access_devices

- id
- unit_id
- provider
- model
- device_type
- communication_type
- identifier
- status
- capabilities_json
- config_json
- last_seen_at

### access_credentials

- id
- aluno_id
- unit_id
- credential_type
- provider
- external_identifier
- template_ref
- template_hash
- status
- metadata_json

### access_attempts

- id
- correlation_id
- unit_id
- device_id
- provider
- credential_type
- external_identifier_masked
- resolved_aluno_id
- decision
- reason_code
- latency_ms
- created_at

### manual_access_overrides

- id
- aluno_id
- unit_id
- granted_by_user_id
- reason
- scope
- expires_at
- consumed_at
- status

## Sem hardware real

Antes de integrar dispositivo físico:

1. criar contrato
2. criar modelo persistente
3. criar provider simulator
4. criar facial webcam mock
5. criar cartão/PIN mock
6. validar fluxo completo
7. depois integrar 1 provider real

## Segurança/LGPD

Biometria e face são dados sensíveis.

Diretrizes:

- evitar armazenar imagem bruta sem necessidade
- preferir template/embedding/referência
- permitir revogação de credencial
- auditar enrollment/revogação
- proteger payload sensível
- hashear/redigir payload bruto
- segregar por tenant/unidade
