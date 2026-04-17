import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";

const API = "http://localhost:3001";

export default function FormAlunoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNovo = !id || id === "novo";

  const [form, setForm] = useState({
    nome: "",
    status: "ativo",
    dia_vencimento: "",
    plano_id: "",
    telefone: "",            // OPCIONAL
    data_nascimento: "",
    matricula: "",
  });

  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  // Responsável via pesquisa
  const [ehResponsavel, setEhResponsavel] = useState(true);
  const [responsavelBusca, setResponsavelBusca] = useState("");
  const [responsavelResultados, setResponsavelResultados] = useState([]);
  const [responsavelId, setResponsavelId] = useState(null);

  useEffect(() => {
    fetch(`${API}/planos`).then(r=>r.json()).then(setPlanos).catch(()=>setErro("Erro ao carregar planos"));
  }, []);

  useEffect(() => {
    if (isNovo) return;
    (async () => {
      try {
        const res = await fetch(`${API}/alunos/${id}`);
        if (!res.ok) throw new Error("Aluno não encontrado");
        const data = await res.json();
        setForm({
          nome: data.nome || "",
          status: data.status || "ativo",
          dia_vencimento: data.dia_vencimento ?? "",
          plano_id: data.plano_id ?? "",
          telefone: data.telefone || "",
          data_nascimento: data.data_nascimento || "",
          matricula: data.matricula || "",
        });
      } catch (err) {
        setErro(err.message);
      }
    })();
  }, [id, isNovo]);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Busca de responsável (debounce)
  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const termo = (responsavelBusca || "").trim();
      if (!termo) { if (active) setResponsavelResultados([]); return; }
      try {
        const url = new URL(`${API}/alunos/pesquisa`);
        url.searchParams.set("termo", termo);
        url.searchParams.set("pagina", "1");
        url.searchParams.set("limite", "15");
        const r = await fetch(url.toString());
        if (r.ok) {
          const jr = await r.json();
          if (active) setResponsavelResultados(jr.alunos || []);
        }
      } catch {}
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [responsavelBusca]);

  async function handleSubmit(e) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    try {
      const metodo = isNovo ? "POST" : "PUT";
      const url = isNovo ? `${API}/alunos` : `${API}/alunos/${id}`;

      const payload = {
        ...form,
        dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : null,
        plano_id: form.plano_id ? Number(form.plano_id) : null,
        // telefone pode ser "" (backend trata como NULL)
      };

      // ✅ Validações obrigatórias (telefone é opcional)
      if (!payload.nome) throw new Error("Informe o nome.");
      if (!payload.data_nascimento) throw new Error("Informe a data de nascimento.");
      if (!payload.plano_id) throw new Error("Selecione o plano.");
      if (!payload.dia_vencimento || payload.dia_vencimento < 1 || payload.dia_vencimento > 31) {
        throw new Error("Dia de vencimento deve estar entre 1 e 31.");
      }

      const resAluno = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const txt = await resAluno.text();
      if (!resAluno.ok) throw new Error(txt || "Erro ao salvar aluno");

      const alunoSalvo = txt ? JSON.parse(txt) : {};
      const alunoId = isNovo ? alunoSalvo.id : Number(id);

      if (!ehResponsavel) {
        if (!responsavelId) throw new Error("Selecione um responsável.");
        const resp = await fetch(`${API}/plano-associado`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aluno_id: alunoId, responsavel_id: Number(responsavelId) }),
        });
        const respTxt = await resp.text();
        if (!resp.ok) throw new Error(respTxt || "Falha ao vincular responsável");
      }

      toast.success(isNovo ? "Aluno cadastrado com sucesso!" : "Aluno atualizado com sucesso!");
      navigate("/alunos");
    } catch (error) {
      toast.error(error.message || "Erro ao salvar aluno");
      setErro(String(error.message || error));
    } finally {
      setCarregando(false);
    }
  }

  if (erro) return <div className="p-4 text-red-600 font-bold">Erro: {erro}</div>;

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-md mt-6">
      <h2 className="text-xl font-bold mb-4">
        {isNovo ? "Cadastrar Novo Aluno" : "Editar Aluno"}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isNovo && (
          <div>
            <label className="font-semibold">Matrícula:</label>
            <input value={form.matricula} disabled className="w-full bg-gray-100 border rounded px-4 py-2 text-gray-600" />
          </div>
        )}

        <div>
          <label className="font-semibold">Nome:</label>
          <input name="nome" value={form.nome} onChange={handleChange} required className="w-full border rounded px-4 py-2" />
        </div>

        <div>
          <label className="font-semibold">Telefone (opcional):</label>
          <input name="telefone" value={form.telefone} onChange={handleChange} placeholder="(99) 99999-9999" className="w-full border rounded px-4 py-2" />
        </div>

        <div>
          <label className="font-semibold">Data de Nascimento:</label>
          <input type="date" name="data_nascimento" value={form.data_nascimento} onChange={handleChange} required className="w-full border rounded px-4 py-2" />
        </div>

        <div>
          <label className="font-semibold">Status:</label>
          <select name="status" value={form.status} onChange={handleChange} className="w-full border rounded px-4 py-2">
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>

        <div>
          <label className="font-semibold">Dia de Vencimento:</label>
          <input type="number" name="dia_vencimento" value={form.dia_vencimento} onChange={handleChange} min={1} max={31} required className="w-full border rounded px-4 py-2" />
        </div>

        <div>
          <label className="font-semibold">Plano:</label>
          <select name="plano_id" value={form.plano_id} onChange={handleChange} required className="w-full border rounded px-4 py-2">
            <option value="">Selecione o plano</option>
            {planos.map(plano => (
              <option key={plano.id} value={plano.id}>{plano.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="font-semibold">É responsável pelo plano?</label>
          <input type="checkbox" checked={ehResponsavel} onChange={(e) => setEhResponsavel(e.target.checked)} />
        </div>

        {!ehResponsavel && (
          <div className="space-y-2">
            <label className="font-semibold">Buscar Responsável:</label>
            <input
              type="text"
              placeholder="Pesquise por matrícula ou nome..."
              value={responsavelBusca}
              onChange={(e) => {
                setResponsavelBusca(e.target.value);
                setResponsavelResultados([]);
                setResponsavelId(null);
              }}
              className="w-full border rounded px-4 py-2"
            />

            {responsavelResultados.length > 0 && (
              <select
                value={responsavelId || ""}
                onChange={(e) => setResponsavelId(Number(e.target.value))}
                className="w-full border rounded px-4 py-2"
                required
              >
                <option value="">Selecione o responsável</option>
                {responsavelResultados.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.matricula || "s/mat.") + " - " + a.nome}
                  </option>
                ))}
              </select>
            )}

            {responsavelBusca && responsavelResultados.length === 0 && (
              <div className="text-sm text-gray-500">Nenhum resultado para “{responsavelBusca}”.</div>
            )}
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button type="button" onClick={() => navigate("/alunos")} className="border px-4 py-2 rounded text-gray-700 hover:bg-gray-100">Cancelar</button>
          <button type="submit" disabled={carregando} className={`px-4 py-2 rounded text-white font-bold ${carregando ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}>
            {carregando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
