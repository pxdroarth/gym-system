import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { menu } from "./Sidebar";
import useAuth from "../hooks/useAuth";
import { fetchAlunos } from "../services/alunoService";
import { fetchProdutos } from "../services/produtoService";
import { UI_PERMISSIONS, userHasUiPermission } from "../utils/permissions";

const normalize = (text) => String(text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default function GlobalSearch() {
  const { user, currentUnit } = useAuth();
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const term = normalize(query.trim());

  useEffect(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
  }, [pathname, currentUnit?.id]);

  useEffect(() => {
    if (!open || term.length < 2) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const [students, products] = await Promise.allSettled([
        userHasUiPermission(user, UI_PERMISSIONS.NAV_ALUNOS) ? fetchAlunos() : [],
        userHasUiPermission(user, UI_PERMISSIONS.NAV_PRODUTOS) ? fetchProdutos() : [],
      ]);
      if (!active) return;
      const matches = (value) => normalize(value).includes(term);
      setResults([
        ...(students.value || []).filter((a) => [a.nome, a.matricula, a.telefone].some(matches)).slice(0, 4)
          .map((a) => ({ to: `/alunos/${a.id}`, label: a.nome, type: "Aluno" })),
        ...(products.value || []).filter((p) => matches(p.nome)).slice(0, 3)
          .map((p) => ({ to: `/produtos?busca=${encodeURIComponent(p.nome)}`, label: p.nome, type: "Produto" })),
        ...menu.filter((item) => userHasUiPermission(user, item.permission) && matches(item.label))
          .map((item) => ({ to: item.to || item.submenu[0].to, label: item.label, type: "Módulo" })),
      ]);
      setLoading(false);
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [open, term, user, currentUnit?.id]);

  return (
    <div className="gym-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <input type="search" aria-label="Busca global" placeholder="Buscar alunos, produtos, módulos…"
        value={query} onFocus={() => setOpen(true)} onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setResults([]);
        }} />
      <Search size={19} aria-hidden="true" />
      {open && term.length >= 2 && (
        <div className="gym-search__results">
          {loading ? <p>Buscando…</p> : results.length ? results.map(({ to, label, type }) => (
            <Link key={to} to={to} onClick={() => { setOpen(false); setQuery(""); }}>{label}<small>{type}</small></Link>
          )) : <p>Nenhum resultado na unidade.</p>}
        </div>
      )}
    </div>
  );
}
