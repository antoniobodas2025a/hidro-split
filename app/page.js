"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MessageCircle, Droplets, FileText, Settings, BarChart3, Activity, X, Save, TrendingUp, AlertTriangle, Calendar, PieChart } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// ============================================================================
// INFRAESTRUCTURA LÓGICA (EL CONTENEDOR)
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const MESES_PERMITIDOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function AppAgua() {
  const [activeTab, setActiveTab] = useState('factura');
  const [activeUnit, setActiveUnit] = useState('Apto 201');
  
  // Estado del recibo global
  const [factura, setFactura] = useState({ 
    costo: '', metros: '', valorMetro: 0, mes: 'Abril', anio: new Date().getFullYear() 
  });

  // Estado de lecturas y balances
  const [lectura, setLectura] = useState({ anterior: 0, actual: '' });
  const [unidadData, setUnidadData] = useState({ id: null, nombre: 'Apto 201', whatsapp: '' });
  const [resumenLecturas, setResumenLecturas] = useState([]);
  
  // NUEVO: Estado del Histórico (Últimos 6 meses)
  const [historico, setHistorico] = useState({ facturas: [], lecturas: [] });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // CARGA INICIAL: Sincronización robusta con PostgreSQL
  useEffect(() => {
    const cargarDatos = async () => {
      const anioNum = Number(factura.anio);

      // A. Cargar configuración de unidad actual
      const { data: uData } = await supabase.from('unidades').select('*').eq('nombre', activeUnit).maybeSingle();
      if (uData) {
        setUnidadData({ id: uData.id, nombre: activeUnit, whatsapp: uData.whatsapp || '' });
        setLectura({ anterior: uData.lectura_inicial || 0, actual: '' });
      }

      // B. Cargar factura general del periodo
      const { data: fData } = await supabase.from('facturas_generales').select('*').eq('mes', factura.mes).eq('anio', anioNum).maybeSingle();
      if (fData) {
        setFactura(prev => ({ ...prev, costo: fData.costo_total, metros: fData.metros_totales }));
      } else {
        setFactura(prev => ({ ...prev, costo: '', metros: '' }));
      }

      // C. Cargar histórico del periodo para el Balance de la pestaña 3
      const { data: lData } = await supabase.from('lecturas').select('consumo, valor_pagar, unidades(nombre)').eq('mes', factura.mes).eq('anio', anioNum);
      if (lData) setResumenLecturas(lData);

      // D. Cargar Analítica Histórica (Últimos 6 registros de facturas)
      const { data: histFac } = await supabase.from('facturas_generales').select('*').order('anio', { ascending: false }).order('id', { ascending: false }).limit(6);
      const { data: histLec } = await supabase.from('lecturas').select('mes, anio, consumo, valor_pagar, unidades(nombre)');
      
      if (histFac && histLec) {
        // Invertir para que el gráfico muestre el tiempo de izquierda a derecha
        setHistorico({ facturas: histFac.reverse(), lecturas: histLec }); 
      }
    };

    cargarDatos();
  }, [activeUnit, factura.mes, factura.anio]);

  // Cálculos en tiempo real
  const consumoIndividual = (Number(lectura.actual) || 0) - Number(lectura.anterior);
  const costoGlobal = Number(factura.costo) || 0;
  const metrosGlobal = Number(factura.metros) || 0;
  const valorMetro = metrosGlobal > 0 ? (costoGlobal / metrosGlobal) : 0;
  const totalPagarIndividual = consumoIndividual > 0 ? consumoIndividual * valorMetro : 0;

  // Mutaciones de Base de Datos
  const guardarConfiguracion = async () => {
    setIsSaving(true);
    const { error } = await supabase.from('unidades').update({ whatsapp: unidadData.whatsapp }).eq('nombre', activeUnit);
    setIsSaving(false);
    if (error) alert("Error: " + error.message); else setIsSettingsOpen(false);
  };

  const guardarFacturaGeneral = async () => {
    if (!factura.costo || !factura.metros) return alert("Error: Debe ingresar costo y metros del recibo.");
    setIsSaving(true);
    const { error } = await supabase.from('facturas_generales').upsert({
      mes: factura.mes, anio: Number(factura.anio),
      costo_total: costoGlobal, metros_totales: metrosGlobal, valor_metro: valorMetro
    }, { onConflict: 'mes, anio' });
    setIsSaving(false);
    if (error) alert("Error de base de datos: " + error.message); else alert("Factura global guardada. Precio establecido.");
  };

  const guardarLectura = async () => {
    if (!lectura.actual || consumoIndividual < 0) return alert("Lectura inválida.");
    setIsSaving(true);
    const { error: errorL } = await supabase.from('lecturas').insert([{
      mes: factura.mes, anio: Number(factura.anio), unidad_id: unidadData.id,
      lectura_anterior: lectura.anterior, lectura_actual: lectura.actual,
      consumo: consumoIndividual, valor_pagar: totalPagarIndividual
    }]);
    const { error: errorU } = await supabase.from('unidades').update({ lectura_inicial: Number(lectura.actual) }).eq('id', unidadData.id);
    setIsSaving(false);
    if (errorL || errorU) alert("Fallo al guardar: " + (errorL?.message || errorU?.message));
    else {
      alert(`Lectura de ${activeUnit} registrada.`);
      setLectura(prev => ({ ...prev, anterior: lectura.actual, actual: '' }));
    }
  };

  const compartirWhatsApp = () => {
    const texto = `*Recibo de Agua - ${factura.mes} ${factura.anio}*\n🏢 Unidad: ${activeUnit}\n📉 Ant: ${lectura.anterior}\n📈 Act: ${lectura.actual}\n💧 Consumo: ${consumoIndividual} m3\n💰 *Total: $${totalPagarIndividual.toLocaleString('es-CO')}*`;
    window.open(`https://wa.me/${unidadData.whatsapp}?text=${encodeURIComponent(texto)}`, '_blank');
  };

  return (
    <AppAguaPresentation 
      state={{ activeTab, activeUnit, factura, lectura, unidadData, resumenLecturas, historico, isSettingsOpen, isSaving }}
      actions={{ setActiveTab, setActiveUnit, setFactura, setLectura, setIsSettingsOpen, setUnidadData, guardarFacturaGeneral, guardarLectura, guardarConfiguracion, compartirWhatsApp }}
      calculos={{ valorMetro, totalPagarIndividual, consumoIndividual }}
    />
  );
}

// ============================================================================
// INFRAESTRUCTURA PRESENTACIONAL (UI/UX 2026)
// ============================================================================

export function AppAguaPresentation({ state, actions, calculos }) {
  const unidadesArr = ['Apto 201', 'Apto 202', 'Apto 301', 'Apto 302', 'Restaurante'];
  const metrosRegistrados = state.resumenLecturas.reduce((acc, curr) => acc + curr.consumo, 0);
  const delta = Number(state.factura.metros) - metrosRegistrados;

  // Preparación de datos para Recharts (Analytics)
  const chartDataEdificio = state.historico.facturas.map(f => {
    const lecturasDelMes = state.historico.lecturas.filter(l => l.mes === f.mes && l.anio === f.anio);
    const totalCobrado = lecturasDelMes.reduce((acc, l) => acc + l.consumo, 0);
    return {
      periodo: `${f.mes.substring(0,3)} ${f.anio}`,
      "Metros Edificio": Number(f.metros_totales),
      "Metros Cobrados": totalCobrado
    };
  });

  const chartDataUnidad = state.historico.facturas.map(f => {
    const lecturaUnidad = state.historico.lecturas.find(l => l.mes === f.mes && l.anio === f.anio && l.unidades?.nombre === state.activeUnit);
    return {
      periodo: `${f.mes.substring(0,3)} ${f.anio}`,
      "Costo ($)": lecturaUnidad ? lecturaUnidad.valor_pagar : 0,
      "Consumo (m3)": lecturaUnidad ? lecturaUnidad.consumo : 0
    };
  });

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-200 font-sans pb-32 overflow-x-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,#312e81,transparent_50%)] pointer-events-none opacity-40" />

      <header className="relative z-10 px-6 py-10 flex justify-between items-center max-w-3xl mx-auto">
        <div>
          <span className="text-xs font-bold tracking-widest text-indigo-400 uppercase">HidroSplit Core</span>
          <h1 className="text-3xl font-light text-white tracking-tight">{state.activeTab.toUpperCase()}</h1>
        </div>
        <div className="bg-zinc-900/50 border border-white/5 p-2 rounded-full backdrop-blur-md">
          <Activity className="size-5 text-emerald-400 animate-pulse" />
        </div>
      </header>

      <main className="relative z-10 px-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* VISTA 1: FACTURA (CONFIGURACIÓN DE PERIODO) */}
        {state.activeTab === 'factura' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl">
              <p className="text-xs text-zinc-500 uppercase font-bold mb-6 tracking-widest flex items-center gap-2"><Calendar size={14}/> Periodo de Cobro</p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <select 
                  value={state.factura.mes} 
                  onChange={(e) => actions.setFactura({...state.factura, mes: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-lg font-serif text-white focus:border-indigo-500 focus:outline-none appearance-none"
                >
                  {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input 
                  type="number" value={state.factura.anio} onChange={(e) => actions.setFactura({...state.factura, anio: e.target.value})} 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-lg font-serif text-white focus:border-indigo-500 focus:outline-none text-center" 
                />
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-4 text-zinc-500">$</span>
                  <input type="number" value={state.factura.costo} onChange={(e) => actions.setFactura({...state.factura, costo: e.target.value})} placeholder="Costo Recibo Acueducto" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl pl-10 pr-6 py-4 text-xl focus:border-indigo-500 focus:outline-none transition-all" />
                </div>
                <div className="relative">
                  <span className="absolute right-4 top-4 text-zinc-500">m³</span>
                  <input type="number" value={state.factura.metros} onChange={(e) => actions.setFactura({...state.factura, metros: e.target.value})} placeholder="Metros Totales del Edificio" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-xl focus:border-indigo-500 focus:outline-none transition-all" />
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-zinc-800 flex justify-between items-center">
                <div>
                  <p className="text-xs text-zinc-500 uppercase font-bold">Precio m³ Calculado</p>
                  <p className="text-3xl font-serif text-indigo-400">${calculos.valorMetro.toFixed(2)}</p>
                </div>
                <button onClick={actions.guardarFacturaGeneral} disabled={state.isSaving} className="bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-2xl shadow-lg transition-all active:scale-95">
                  <Save size={24} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VISTA 2: MEDIDORES (OPERACIÓN) */}
        {state.activeTab === 'medidores' && (
          <div className="space-y-6">
            {/* ESCUDO DE CONTEXTO VISUAL */}
            <div className="bg-indigo-500/10 border border-indigo-500/20 px-5 py-3 rounded-2xl flex items-center gap-3">
              <Calendar className="size-5 text-indigo-400" />
              <p className="text-sm font-medium text-indigo-200">Registrando lecturas para: <span className="font-bold text-white tracking-wide">{state.factura.mes.toUpperCase()} {state.factura.anio}</span></p>
            </div>

            <nav className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {unidadesArr.map(u => (
                <button key={u} onClick={() => actions.setActiveUnit(u)} className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-medium transition-all border ${state.activeUnit === u ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500 border-white/5 hover:text-zinc-300'}`}>{u}</button>
              ))}
            </nav>

            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl">
              <div className="flex justify-between items-start mb-8">
                <h3 className="text-2xl font-light text-white">{state.activeUnit}</h3>
                <button onClick={() => actions.setIsSettingsOpen(true)} className="p-2 bg-zinc-950 border border-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors"><Settings size={20}/></button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase">Anterior</p>
                  <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-xl text-zinc-600 font-serif h-[62px] flex items-center">{state.lectura.anterior}</div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Actual</p>
                  <input type="number" value={state.lectura.actual} onChange={(e) => actions.setLectura({...state.lectura, actual: e.target.value})} className="w-full bg-zinc-950 border border-indigo-500/30 p-4 rounded-xl text-xl text-white focus:outline-none focus:border-indigo-500 h-[62px]" placeholder="0" />
                </div>
              </div>
              <div className="text-center py-8 border-y border-zinc-800 mb-8">
                <p className="text-xs text-zinc-500 uppercase font-bold mb-1">Total a Cobrar</p>
                <p className="text-5xl font-serif text-emerald-400">${calculos.totalPagarIndividual.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
              </div>
              <button onClick={actions.guardarLectura} disabled={state.isSaving || !state.lectura.actual} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold mb-3 hover:bg-indigo-500 flex justify-center gap-2 transition-all disabled:opacity-50">
                <Save size={20}/> {state.isSaving ? 'Procesando...' : 'Guardar en Base de Datos'}
              </button>
              <button onClick={actions.compartirWhatsApp} className="w-full bg-green-600/10 text-green-500 border border-green-600/20 py-4 rounded-2xl font-bold hover:bg-green-600/20 flex justify-center gap-2 transition-all">
                <MessageCircle size={20}/> Notificar por WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* VISTA 3: BALANCE (RESUMEN ACTUAL) */}
        {state.activeTab === 'balance' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl">
              <h3 className="text-xl font-medium mb-6">Estado: {state.factura.mes}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-950 p-6 rounded-3xl border border-white/5">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Metros Recibo</p>
                  <p className="text-3xl font-serif">{state.factura.metros || 0}</p>
                </div>
                <div className="bg-zinc-950 p-6 rounded-3xl border border-white/5">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Metros Cobrados</p>
                  <p className="text-3xl font-serif text-indigo-400">{metrosRegistrados}</p>
                </div>
              </div>
              <div className={`mt-6 p-8 rounded-3xl flex items-center justify-between ${delta <= 0 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Diferencia (Pérdida)</p>
                  <p className={`text-4xl font-serif ${delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{delta.toFixed(2)} m³</p>
                </div>
                {delta > 0 ? <AlertTriangle size={40} className="text-red-500 opacity-50" /> : <TrendingUp size={40} className="text-emerald-500 opacity-50" />}
              </div>
            </div>
          </div>
        )}

        {/* VISTA 4: ANALYTICS (TENDENCIAS) */}
        {state.activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Gráfico 1: Consumo Global */}
            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 p-6 rounded-[2.5rem] shadow-2xl">
              <h3 className="text-lg font-medium mb-1">Eficiencia del Edificio</h3>
              <p className="text-xs text-zinc-500 mb-6">Metros pagados vs Metros cobrados (6 meses)</p>
              
              <div className="w-full" style={{ minHeight: '250px', height: '300px' }}>
  <ResponsiveContainer width="100%" height="100%" minHeight={250}>
                  <BarChart data={chartDataEdificio} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="periodo" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: '#27272a', opacity: 0.4}} contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Metros Edificio" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Metros Cobrados" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 2: Historial Individual */}
            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 p-6 rounded-[2.5rem] shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-medium">Historial Financiero</h3>
                  <p className="text-xs text-zinc-500">Tendencia de cobro en pesos</p>
                </div>
                <select 
                  value={state.activeUnit} onChange={(e) => actions.setActiveUnit(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 text-sm rounded-xl px-3 py-2 text-white focus:outline-none"
                >
                  {unidadesArr.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              
              <div className="w-full" style={{ minHeight: '250px', height: '250px' }}>
  <ResponsiveContainer width="100%" height="100%" minHeight={250}>
                  <AreaChart data={chartDataUnidad} margin={{ top: 10, right: 0, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCosto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="periodo" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px' }} formatter={(value) => `$${value.toLocaleString()}`} />
                    <Area type="monotone" dataKey="Costo ($)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCosto)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODAL AJUSTES */}
      {state.isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-zinc-900 border border-white/10 p-8 rounded-[2rem] w-full max-w-sm shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-medium">Ajustes {state.activeUnit}</h3>
              <button onClick={() => actions.setIsSettingsOpen(false)} className="text-zinc-500 hover:text-white transition-colors"><X size={24}/></button>
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">Número WhatsApp</label>
                <input type="tel" value={state.unidadData.whatsapp} onChange={(e) => actions.setUnidadData({...state.unidadData, whatsapp: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white focus:border-indigo-500 focus:outline-none" placeholder="57..." />
              </div>
              <button onClick={actions.guardarConfiguracion} disabled={state.isSaving} className="w-full bg-indigo-600 py-4 rounded-xl font-bold flex justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
                <Save size={20}/> {state.isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCK NAVEGACIÓN (AHORA CON 4 BOTONES) */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-2 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-full shadow-2xl">
        <button onClick={() => actions.setActiveTab('factura')} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${state.activeTab === 'factura' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}><FileText size={22}/></button>
        <button onClick={() => actions.setActiveTab('medidores')} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${state.activeTab === 'medidores' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}><Droplets size={22}/></button>
        <button onClick={() => actions.setActiveTab('balance')} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${state.activeTab === 'balance' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}><BarChart3 size={22}/></button>
        <button onClick={() => actions.setActiveTab('analytics')} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${state.activeTab === 'analytics' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}><PieChart size={22}/></button>
      </nav>
    </div>
  );
}