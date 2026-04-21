import React, { useEffect, useState } from "react";
import { Link2, Users } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import Input from "../../../components/ui/Input";
import KpiCard from "../../../components/ui/KpiCard";
import PageHeader from "../../../components/ui/PageHeader";

const API = "http://localhost:3001";

function AlunoLinha({ aluno, action, actionLabel, muted }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50">
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
    const t = setTimeout(async () => {
      const termo = (responsavelBusca || "").trim();
      if (!termo) {
        if (active) setResponsavelResultados([]);
        return;
      }
      try {
        const url = new URL(`${API}/alunos/pesquisa`);
        url.searchParams.set("termo", termo);
        url.searchParams.set("pagina", "1");
        url.searchParams.set("limite", "10");
        const r = await fetch(url);
        if (r.ok) {
          const jr = await r.json();
          if (active) setResponsavelResultados(jr.alunos || []);
        }
      } catch {/* noop */}
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [responsavelBusca]);

  useEffect(() => {
    if (!responsavelSel?.id) {
      setAssociados([]);
      return;
    }
    (async () => {
      try {
        setCarregandoAssociados(true);
        const r = await fetch(`${API}/plano-associado/${responsavelSel.id}`);
        if (!r.ok) throw new Error("Erro ao carregar vínculos");
        const jr = await r.json();
        const arr = (jr.associados || []).map((a) => ({
          id: a.id,
          aluno_id: a.aluno_id || a.id_aluno || a.aluno_id,
          nome: a.nome,
          matricula: a.matricula,
        }));
        setAssociados(arr);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setCarregandoAssociados(false);
      }
    })();
  }, [responsavelSel?.id]);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const termo = (busca || "").trim();
      if (!termo || !responsavelSel?.id) {
        if (active) setResultados([]);
        return;
      }
      setBuscando(true);
      try {
        const url = new URL(`${API}/alunos/pesquisa`);
        url.searchParams.set("termo", termo);
        url.searchParams.set("pagina", "1");
        url.searchParams.set("limite", "20");
        const r = await fetch(url);
        if (r.ok) {
          const jr = await r.json();
          let lista = jr.alunos || [];
          const idsJa = new Set(associados.map((a) => a.aluno_id));
          lista = lista.filter((a) => a.id !== responsavelSel.id && !idsJa.has(a.id));
          if (active) setResultados(lista);
        }
      } catch {/* noop */}
      finally { setBuscando(false); }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [busca, responsavelSel?.id, associados]);

  async function adicionarAluno(aluno) {
    if (!responsavelSel?.id) return;
    try {
      const resp = await fetch(`${API}/plano-associado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aluno_id: Number(aluno.id),
          responsavel_id: Number(responsavelSel.id),
        }),
      });
      const txt = await resp.text();
      if (!resp.ok) throw new Error(txt || "Falha ao vincular");
      const body = txt ? JSON.parse(txt) : {};
      toast.success(`Vinculado: ${aluno.matricula} - ${aluno.nome}`);
      setAssociados((prev) => [
        ...prev,
        { id: body.id, aluno_id: aluno.id, nome: aluno.nome, matricula: aluno.matricula },
      ]);
      setResultados((prev) => prev.filter((x) => x.id !== aluno.id));
      setBusca("");
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removerVinculo(v) {
    try {
      const r = await fetch(`${API}/plano-associado/${v.id}`, { method: "DELETE" });
      const txt = await r.text();
      if (!r.ok) throw new Error(txt || "Falha ao remover vínculo");
      toast.info(`Removido: ${v.matricula} - ${v.nome}`);
      setAssociados((prev) => prev.filter((a) => a.id !== v.id));
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function removerTodos() {
    if (associados.length === 0) return;
    const confirma = confirm(
      `Remover TODOS os ${associados.length} vínculos deste responsável?`
    );
    if (!confirma) return;

    await Promise.allSettled(
      associados.map((v) =>
        fetch(`${API}/plano-associado/${v.id}`, { method: "DELETE" })
      )
    );
    toast.info("Todos os vínculos foram removidos.");
    setAssociados([]);
  }

  const bloqueado = !responsavelSel?.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vínculos de Planos Compartilhados"
        subtitle="Organize a relação dependente-responsável preservando a operação atual."
      />

      <div className="ui-status-grid">
        <KpiCard label="Responsável" value={responsavelSel ? "Selecionado" : "Pendente"} icon={<Users size={20} />} tone={responsavelSel ? "green" : "amber"} />
        <KpiCard label="Vinculados" value={associados.length} icon={<Link2 size={20} />} tone="blue" />
      </div>

      <Card className="p-5">
        <div className="ui-section-header px-0 pt-0">
          <div>
            <h2 className="ui-section-title">Selecione o responsável</h2>
            <p className="ui-section-subtitle">Busque por matrícula ou nome para carregar os dependentes vinculados.</p>
          </div>
        </div>

        <div className="flex gap-3 items-start flex-col md:flex-row">
          <div className="flex-1 relative w-full">
            <Input
              type="text"
              placeholder="Buscar por matrícula ou nome..."
              value={responsavelBusca}
              onChange={(e) => setResponsavelBusca(e.target.value)}
            />

            {!!responsavelBusca && responsavelResultados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border rounded-lg bg-white shadow">
                {responsavelResultados.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setResponsavelSel({
                        id: r.id,
                        nome: r.nome,
                        matricula: r.matricula,
                      });
                      setResponsavelResultados([]);
                      setResponsavelBusca(`${r.matricula} - ${r.nome}`);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100"
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
            <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
              <div className="font-semibold text-blue-800">
                <span className="font-mono text-xs">{responsavelSel.matricula}</span> - {responsavelSel.nome}
              </div>
              <Badge tone="blue">{associados.length} vinculados</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResponsavelSel(null);
                  setAssociados([]);
                  setResultados([]);
                  setResponsavelBusca("");
                }}
              >
                Trocar
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className={`grid md:grid-cols-2 gap-6 ${bloqueado ? "opacity-50 pointer-events-none" : ""}`}>
        <Card>
          <div className="ui-section-header">
            <div>
              <h3 className="ui-section-title">Alunos disponíveis</h3>
              <p className="ui-section-subtitle">Pesquise e adicione dependentes ao responsável.</p>
            </div>
            <Badge tone="gray">{resultados.length}</Badge>
          </div>

          <div className="p-4 border-b">
            <Input
              type="text"
              placeholder="Digite para buscar por matrícula ou nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              disabled={bloqueado}
            />
          </div>

          <div className="max-h-80 overflow-auto divide-y">
            {buscando && <EmptyState title="Buscando..." />}
            {!buscando && resultados.length === 0 && <EmptyState title="Nenhum resultado." />}
            {resultados.map((a) => (
              <AlunoLinha key={a.id} aluno={a} action={() => adicionarAluno(a)} actionLabel="Adicionar" />
            ))}
          </div>
        </Card>

        <Card>
          <div className="ui-section-header">
            <div>
              <h3 className="ui-section-title">Vinculados ao responsável</h3>
              <p className="ui-section-subtitle">Dependentes que compartilham a condição do responsável.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="blue">{associados.length}</Badge>
              <Button
                size="sm"
                variant="danger"
                onClick={removerTodos}
                disabled={associados.length === 0}
              >
                Remover todos
              </Button>
            </div>
          </div>

          <div className="max-h-80 overflow-auto divide-y">
            {carregandoAssociados && <EmptyState title="Carregando..." />}
            {!carregandoAssociados && associados.length === 0 && <EmptyState title="Nenhum aluno vinculado." />}
            {associados.map((v) => (
              <AlunoLinha key={v.id} aluno={v} action={() => removerVinculo(v)} actionLabel="Remover" muted />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
