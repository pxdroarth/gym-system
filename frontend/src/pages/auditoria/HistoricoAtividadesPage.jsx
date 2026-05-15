import React, { useEffect, useMemo, useState } from "react";
import { Clock3, Eye, FileClock, Filter } from "lucide-react";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import Table from "../../components/ui/Table";
import useAuth from "../../hooks/useAuth";
import { fetchAuditLogById, fetchAuditLogs } from "../../services/auditLogService";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { UI_PERMISSIONS } from "../../utils/permissions";

const initialFilters = {
  data_inicio: "",
  data_fim: "",
  module: "",
  action: "",
  actor: "",
  unit_id: "",
};

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelFromValue(value) {
  if (!value) return "-";
  return String(value)
    .replaceAll("tenant", "rede")
    .replaceAll("unit", "unidade")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function JsonBlock({ title, value }) {
  const parsed = parseJsonSafe(value);
  const content = parsed === null
    ? "Sem dados registrados."
    : typeof parsed === "string"
      ? parsed
      : JSON.stringify(parsed, null, 2);

  return (
    <div className="governance-modal-panel">
      <h3 className="governance-modal-panel__title">{title}</h3>
      <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
        {content}
      </pre>
    </div>
  );
}

export default function HistoricoAtividadesPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ pagina: 1, limite: 20, total: 0 });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const allowedUnits = user?.allowedUnits || [];
  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limite));

  const activeParams = useMemo(() => {
    const params = {
      pagina: pagination.pagina,
      limite: pagination.limite,
    };

    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value !== "") params[key] = value;
    });

    return params;
  }, [appliedFilters, pagination.pagina, pagination.limite]);

  async function carregarLogs() {
    setLoading(true);
    setErro(null);
    try {
      const resposta = await fetchAuditLogs(activeParams);
      const payload = resposta.data || {};
      setLogs(payload.logs || []);
      setPagination((prev) => ({
        ...prev,
        total: payload.total || 0,
        pagina: payload.pagina || prev.pagina,
        limite: payload.limite || prev.limite,
      }));
    } catch (error) {
      setErro(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarLogs();
  }, [activeParams]);

  function handleFilterChange(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function aplicarFiltros(event) {
    event.preventDefault();
    setPagination((prev) => ({ ...prev, pagina: 1 }));
    setAppliedFilters(filters);
  }

  function limparFiltros() {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
    setPagination((prev) => ({ ...prev, pagina: 1 }));
  }

  async function abrirDetalhe(log) {
    setDetailLoading(true);
    setSelectedLog(log);
    try {
      const resposta = await fetchAuditLogById(log.id);
      setSelectedLog(resposta.data || log);
    } catch (error) {
      setSelectedLog({
        ...log,
        detalheErro: getApiErrorMessage(error),
      });
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <RoleGate
      permission={UI_PERMISSIONS.HISTORICO_ATIVIDADES_VISUALIZAR}
      fallback={
        <EmptyState
          title="Area restrita."
          description="Historico de Atividades fica disponivel apenas para administradores autorizados."
        />
      }
    >
      <div className="governance-shell">
        <PageHeader
          title="Historico de Atividades"
          subtitle="Consulta segura e somente leitura dos eventos criticos ja registrados."
          actions={<Badge tone="blue">Somente leitura</Badge>}
        />

        <div className="ui-status-grid">
          <Card>
            <div className="ui-kpi-card__inner">
              <div>
                <div className="ui-kpi-card__label">Registros encontrados</div>
                <div className="ui-kpi-card__value">{pagination.total}</div>
                <div className="ui-kpi-card__subtitle">Conforme filtros e escopo autorizado.</div>
              </div>
              <span className="ui-kpi-card__icon"><FileClock size={20} /></span>
            </div>
          </Card>
          <Card>
            <div className="ui-kpi-card__inner">
              <div>
                <div className="ui-kpi-card__label">Pagina atual</div>
                <div className="ui-kpi-card__value">{pagination.pagina}</div>
                <div className="ui-kpi-card__subtitle">De {totalPages} pagina(s).</div>
              </div>
              <span className="ui-kpi-card__icon"><Clock3 size={20} /></span>
            </div>
          </Card>
        </div>

        <Card className="governance-filter-card">
          <form className="governance-filter-bar" onSubmit={aplicarFiltros}>
            <div className="governance-filter-bar__group">
              <Input
                label="Inicio"
                type="date"
                value={filters.data_inicio}
                onChange={(event) => handleFilterChange("data_inicio", event.target.value)}
              />
              <Input
                label="Fim"
                type="date"
                value={filters.data_fim}
                onChange={(event) => handleFilterChange("data_fim", event.target.value)}
              />
              <Input
                label="Modulo"
                placeholder="Ex.: financeiro"
                value={filters.module}
                onChange={(event) => handleFilterChange("module", event.target.value)}
              />
              <Input
                label="Acao"
                placeholder="Ex.: criar"
                value={filters.action}
                onChange={(event) => handleFilterChange("action", event.target.value)}
              />
              <Input
                label="Usuario"
                placeholder="Nome do operador"
                value={filters.actor}
                onChange={(event) => handleFilterChange("actor", event.target.value)}
              />
              <Select
                label="Unidade"
                value={filters.unit_id}
                onChange={(event) => handleFilterChange("unit_id", event.target.value)}
              >
                <option value="">Todas permitidas</option>
                {allowedUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.nome || `Unidade #${unit.id}`}
                  </option>
                ))}
              </Select>
            </div>
            <div className="governance-filter-bar__group">
              <Button type="submit"><Filter size={16} /> Filtrar</Button>
              <Button type="button" variant="ghost" onClick={limparFiltros}>Limpar</Button>
            </div>
          </form>
        </Card>

        <Card className="governance-table-card">
          <div className="governance-panel__body">
            <div className="ui-section-header">
              <div>
                <h2 className="ui-section-title">Eventos registrados</h2>
                <p className="ui-section-subtitle">A visualizacao respeita Rede, Unidade e papel do operador autenticado.</p>
              </div>
              <Badge tone="gray">Somente leitura</Badge>
            </div>

            {loading ? (
              <EmptyState title="Carregando historico..." />
            ) : erro ? (
              <EmptyState title={erro} />
            ) : logs.length === 0 ? (
              <EmptyState
                title="Nenhum evento encontrado."
                description="Ajuste os filtros ou consulte outro periodo dentro do seu escopo permitido."
              />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Operador</th>
                      <th>Acao</th>
                      <th>Modulo</th>
                      <th>Registro</th>
                      <th>Unidade</th>
                      <th>Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.created_at)}</td>
                        <td>
                          <div className="font-semibold">{log.actor_name || "Operador"}</div>
                          {log.actor_id && <div className="text-xs text-slate-500">ID {log.actor_id}</div>}
                        </td>
                        <td><Badge tone="blue">{labelFromValue(log.action)}</Badge></td>
                        <td>{labelFromValue(log.module)}</td>
                        <td>
                          <div className="font-semibold">{labelFromValue(log.record_type)}</div>
                          <div className="text-xs text-slate-500">{log.record_id || "-"}</div>
                        </td>
                        <td>{log.unit_id ? `Unidade #${log.unit_id}` : "-"}</td>
                        <td>
                          <Button variant="ghost" size="sm" onClick={() => abrirDetalhe(log)}>
                            <Eye size={15} /> Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                <div className="ui-pagination">
                  <div className="ui-pagination__status">
                    Pagina {pagination.pagina} de {totalPages} | {pagination.total} registro(s)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pagination.pagina <= 1}
                      onClick={() => setPagination((prev) => ({ ...prev, pagina: prev.pagina - 1 }))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pagination.pagina >= totalPages}
                      onClick={() => setPagination((prev) => ({ ...prev, pagina: prev.pagina + 1 }))}
                    >
                      Proxima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        {selectedLog && (
          <Modal
            title="Detalhe do Evento"
            className="ui-modal--xl"
            onClose={() => setSelectedLog(null)}
          >
            {detailLoading ? (
              <EmptyState title="Carregando detalhe..." />
            ) : selectedLog.detalheErro ? (
              <EmptyState title={selectedLog.detalheErro} />
            ) : (
              <div className="grid gap-4">
                <div className="ui-info-grid">
                  <div className="ui-info-item">
                    <div className="ui-info-item__label">Data/Hora</div>
                    <div className="ui-info-item__value">{formatDateTime(selectedLog.created_at)}</div>
                  </div>
                  <div className="ui-info-item">
                    <div className="ui-info-item__label">Operador</div>
                    <div className="ui-info-item__value">{selectedLog.actor_name || "Operador"}</div>
                  </div>
                  <div className="ui-info-item">
                    <div className="ui-info-item__label">Modulo</div>
                    <div className="ui-info-item__value">{labelFromValue(selectedLog.module)}</div>
                  </div>
                  <div className="ui-info-item">
                    <div className="ui-info-item__label">Registro</div>
                    <div className="ui-info-item__value">
                      {labelFromValue(selectedLog.record_type)} {selectedLog.record_id || ""}
                    </div>
                  </div>
                </div>

                <div className="governance-modal-grid">
                  <JsonBlock title="Antes" value={selectedLog.before_json} />
                  <JsonBlock title="Depois" value={selectedLog.after_json} />
                </div>
                <JsonBlock title="Metadados" value={selectedLog.metadata_json} />
              </div>
            )}
          </Modal>
        )}
      </div>
    </RoleGate>
  );
}
