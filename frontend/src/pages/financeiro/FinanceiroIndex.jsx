import React from 'react';
import { Outlet } from 'react-router-dom';
import { NavLink } from 'react-router-dom';

export default function FinanceiroIndex() {
  return (
    
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-blue-700 mb-6">Módulo Financeiro</h1>
      <Outlet /> {/* Renderiza as subrotas aqui */}
    </div>
    
    
  );
}
