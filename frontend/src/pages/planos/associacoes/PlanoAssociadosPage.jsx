import React, { useEffect, useState } from "react";
import { Link2, Search, UserPlus, Users } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import Input from "../../../components/ui/Input";
import KpiCard from "../../../components/ui/KpiCard";
import Modal from "../../../components/ui/Modal";
import PageHeader from "../../../components/ui/PageHeader";
import useAuth from "../../../hooks/useAuth";
import {
  fetchAlunosPesquisa,
} from "../../../services/alunoService";
import {
  createPlanoAssociado,
  deletePlanoAssociado,
  fetchPlanoAssociados,
} from "../../../services/planoAssociadoService";
import getApiErrorMessage from "../../../utils/getApiErrorMessage";
import { UI_PERMISSIONS, userHasUiPermission } from "../../../utils/permissions";

function AlunoLinha({ aluno, action, actionLabel, muted }) {
  return (
    <div className="association-row">
      <div className="min-w-0">
        <div className="font-semibold truncate">{aluno.nome}</div>
        <div className="text-xs text-gray-500 font-mono">{aluno.matricula}</div>
      </div>
      {action && (
        <Button size="sm" variant={muted ? "danger" : "primary"} onClick={action}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export default function PlanoAssociadosPage() {
  const { user } = useAuth();
  const canManageAssociacoes = userHasUiPermission(user, UI_PERMISSIONS.ALUNOS_ALTERAR_PLANO_COM_DEPENDENTES);
  const [modalAberto, setModalAberto] = useState(false);
  const [responsavelBusca, setResponsavelBusca] = useState("");
  const [responsavelResultados, setResponsavelResultados] = useState([]);
  const [responsavelSel, setResponsavelSel] = useState(null);

  const [associados, setAssociados] = useState([]);
  const [carregandoAssociados, setCarregandoAssociados] = useState(false);

  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const termo = (responsavelBusca || "").trim();
      if (!modalAberto || !termo) {
        if (active) setResponsavelResultados([]);
        return;
      }
      try {
        const data = await fetchAlunosPesquisa({ termo, pagina: 1, limite: 10 });
        if (active) setResponsavelResultados(data.alunos || []);
      } catch {
        if (active) setResponsavelResultados([]);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [responsavelBusca, modalAberto]);

  useEffect(() => {
    if (!responsavelSel?.id) {
      setAssociados([]);
      return;
    }
    (async () => {
      try {
        setCarregandoAssociados(true);
        const data = await fetchPlanoAssociados(responsavelSel.id);
        const arr = (data.associados || []).map((a) => ({
          id: a.id,
          aluno_id: a.aluno_id || a.id_aluno || a.aluno_id,
          nome: a.nome,
          matricula: a.matricula,
        }));
        setAssociados(arr);
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      } finally {
        setCarregandoAssociados(false);
      }
    })();
  }, [responsavelSel?.id]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const termo = (busca || "").trim();
      if (!modalAberto || !termo || !responsavelSel?.id) {
        if (active) setResultados([]);
        return;
      }
      setBuscando(true);
      try {
        const data = await fetchAlunosPesquisa({ termo, pagina: 1, limite: 20 });
        let lista = data.alunos || [];
        const idsJa = new Set(associados.map((a) => a.aluno_id));
        lista = lista.filter((a) => a.id !== responsavelSel.id && !idsJa.has(a.id));
        if (active) setResultados(lista);
      } catch {
        if (active) setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [busca, responsavelSel?.id, associados, modalAberto]);

  async function adicionarAluno(aluno) {
    if (!responsavelSel?.id) return;
    try {
      const body = await createPlanoAssociado({
        aluno_id: Number(aluno.id),
        responsavel_id: Number(responsavelSel.id),
      });
      toast.success(`Vinculado: ${aluno.matricula} - ${aluno.nome}`);
      setAssociados((prev) => [
        ...prev,
        { id: body.id, aluno_id: aluno.id, nome: aluno.nome, matricula: aluno.matricula },
      ]);
      setResultados((prev) => prev.filter((x) => x.id !== aluno.id));
      setBusca("");
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  }

  async function removerVinculo(v) {
    try {
      await deletePlanoAssociado(v.id);
      toast.info(`Removido: ${v.matricula} - ${v.nome}`);
      setAssociados((prev) => prev.filter((a) => a.id !== v.id));
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  }

  async function removerTodos() {
    if (associados.length === 0) return;
    const confirma = confirm(`Remover TODOS os ${associados.length} vinculos deste responsavel?`);
    if (!confirma) return;

    try {
      await Promise.all(associados.map((v) => deletePlanoAssociado(v.id)));
      toast.info("Todos os vinculos foram removidos.");
      setAssociados([]);
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  }

  function limparResponsavel() {
    setResponsavelSel(null);
    setAssociados([]);
    setResultados([]);
    setResponsavelResultados([]);
    setResponsavelBusca("");
    setBusca("");
  }

  const bloqueado = !responsavelSel?.id;

  return (
    <div className="governance-shell">
      <PageHeader
        title="Associacoes"
        subtitle="Gestao de vinculos entre responsaveis e dependentes."
        actions={
          canManageAssociacoes ? (
            <Button onClick={() => setModalAberto(true)}>
              <UserPlus size={16} />
              Gerenciar vinculos
            </Button>
          ) : null
        }
      />

      <div className="ui-status-grid">
        <KpiCard label="Responsavel" value={responsavelSel ? "Selecionado" : "Nenhum"} icon={<Users size={20} />} tone={responsavelSel ? "green" : "amber"} />
        <KpiCard label="Dependentes vinculados" value={associados.length} icon={<Link2 size={20} />} tone="blue" />
      </div>

      <Card className="governance-table-card">
        <div className="governance-panel__body">
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Vinculos de planos compartilhados</h2>
              <p className="ui-section-subtitle">A tela principal mostra o resumo. O fluxo de busca e manutencao abre em modal.</p>
            </div>
            <Badge tone="gray">Responsavel e dependentes</Badge>
          </div>

          {responsavelSel ? (
            <div className="governance-list">
              <div className="governance-list__item">
                <div>
                  <div className="governance-list__title">{responsavelSel.nome}</div>
                  <div className="governance-list__copy">Matricula {responsavelSel.matricula}</div>
                </div>
                <div className="governance-list__value">{associados.length} vinculados</div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Nenhum responsavel selecionado."
              description="Use Gerenciar vinculos para buscar um responsavel e administrar dependentes."
              action={canManageAssociacoes ? <Button onClick={() => setModalAberto(true)}>Gerenciar vinculos</Button> : null}
            />
          )}
        </div>
      </Card>

      {modalAberto && canManageAssociacoes && (
        <Modal title="Gerenciar vinculos" onClose={() => setModalAberto(false)} className="ui-modal--full">
          <div className="association-modal-grid">
            <Card className="p-4">
              <div className="ui-section-header px-0 pt-0">
                <div>
                  <h2 className="ui-section-title">Responsavel</h2>
                  <p className="ui-section-subtitle">Busque por matricula ou nome.</p>
                </div>
                {responsavelSel && <Badge tone="blue">Selecionado</Badge>}
              </div>

              <div className="relative">
                <Input
                  type="text"
                  placeholder="Buscar responsavel..."
                  value={responsavelBusca}
                  onChange={(e) => setResponsavelBusca(e.target.value)}
                />

                {!!responsavelBusca && responsavelResultados.length > 0 && (
                  <div className="association-search-menu">
                    {responsavelResultados.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setResponsavelSel({ id: r.id, nome: r.nome, matricula: r.matricula });
                          setResponsavelResultados([]);
                          setResponsavelBusca(`${r.matricula} - ${r.nome}`);
                          setBusca("");
                          setResultados([]);
                        }}
                        className="association-search-menu__item"
                      >
                        <span className="font-mono text-xs mr-2">{r.matricula}</span>
                        {r.nome}
                      </button>
                    ))}
                  </div>
                )}

                {!!responsavelBusca && responsavelResultados.length === 0 && (
                  <div className="text-xs text-gray-500 mt-1">Nenhum resultado.</div>
                )}
              </div>

              {responsavelSel?.id && (
                <div className="association-selected">
                  <div>
                    <div className="font-semibold text-blue-900">{responsavelSel.nome}</div>
                    <div className="text-xs text-blue-700 font-mono">{responsavelSel.matricula}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={limparResponsavel}>Trocar</Button>
                </div>
              )}
            </Card>

            <Card className={bloqueado ? "opacity-50 pointer-events-none" : ""}>
              <div className="ui-section-header">
                <div>
                  <h3 className="ui-section-title">Alunos disponiveis</h3>
                  <p className="ui-section-subtitle">Pesquise e adicione dependentes.</p>
                </div>
                <Badge tone="gray">{resultados.length}</Badge>
              </div>

              <div className="p-4 border-b">
                <Input
                  type="text"
                  placeholder="Buscar por matricula ou nome..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  disabled={bloqueado}
                />
              </div>

              <div className="association-list">
                {buscando && <EmptyState title="Buscando..." />}
                {!buscando && resultados.length === 0 && <EmptyState title="Nenhum resultado." />}
                {resultados.map((a) => (
                  <AlunoLinha key={a.id} aluno={a} action={() => adicionarAluno(a)} actionLabel="Adicionar" />
                ))}
              </div>
            </Card>

            <Card className={bloqueado ? "opacity-50 pointer-events-none" : ""}>
              <div className="ui-section-header">
                <div>
                  <h3 className="ui-section-title">Dependentes vinculados</h3>
                  <p className="ui-section-subtitle">Alunos que compartilham a condicao do responsavel.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{associados.length}</Badge>
                  <Button size="sm" variant="danger" onClick={removerTodos} disabled={associados.length === 0}>
                    Remover todos
                  </Button>
                </div>
              </div>

              <div className="association-list">
                {carregandoAssociados && <EmptyState title="Carregando..." />}
                {!carregandoAssociados && associados.length === 0 && <EmptyState title="Nenhum aluno vinculado." />}
                {associados.map((v) => (
                  <AlunoLinha key={v.id} aluno={v} action={() => removerVinculo(v)} actionLabel="Remover" muted />
                ))}
              </div>
            </Card>
          </div>

          <div className="wizard-footer">
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Fechar</Button>
            <Button onClick={() => setModalAberto(false)}>Concluir</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
