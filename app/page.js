"use client";

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MessageCircle, Droplets, FileText, Settings, BarChart3, Activity, X, Save, TrendingUp, AlertTriangle } from 'lucide-react';

// ============================================================================
// INFRAESTRUCTURA LÓGICA (EL CONTENEDOR)
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AppAgua() {
  const [activeTab, setActiveTab] = useState('factura');
  const [activeUnit, setActiveUnit] = useState('Apto 201');
  
  // Estado del recibo global (Factura)
  const [factura, setFactura] = useState({ 
    costo: '', metros: '', valorMetro: 0, mes: 'Abril', anio: 2026 
  });

  // Estado de lecturas y balance
  const [lectura, setLectura] = useState({ anterior: 0, actual: '' });
  const [unidadData, setUnidadData] = useState({ id: null, nombre: 'Apto 201', whatsapp: '' });
  const [resumenLecturas, setResumenLecturas] = useState([]); // Para el balance
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 1. CARGA INICIAL: Sincronización robusta con el esquema PostgreSQL (V1.1 Fix)
  useEffect(() => {
    const cargarDatos = async () => {
      // Coerción de tipo para coincidir con integer en DB
      const anioNum = Number(factura.anio);

      // A. Cargar configuración de unidad (maybeSingle evita error 406 si no existe)
      const { data: uData } = await supabase
        .from('unidades')
        .select('*')
        .eq('nombre', activeUnit)
        .maybeSingle();

      if (uData) {
        setUnidadData({ id: uData.id, nombre: activeUnit, whatsapp: uData.whatsapp || '' });
        setLectura({ anterior: uData.lectura_inicial || 0, actual: '' });
      }

      // B. Cargar factura general (Si no hay datos, retorna null sin crash 406)
      const { data: fData } = await supabase
        .from('facturas_generales')
        .select('*')
        .eq('mes', factura.mes)
        .eq('anio', anioNum)
        .maybeSingle();

      if (fData) {
        setFactura(prev => ({ 
          ...prev, 
          costo: fData.costo_total, 
          metros: fData.metros_totales 
        }));
      } else {
        // Limpiar inputs si el mes no ha sido creado en la base de datos
        setFactura(prev => ({ ...prev, costo: '', metros: '' }));
      }

      // C. Cargar histórico para el Balance
      const { data: lData } = await supabase
        .from('lecturas')
        .select('consumo, valor_pagar, unidades(nombre)')
        .eq('mes', factura.mes)
        .eq('anio', anioNum);
        
      if (lData) setResumenLecturas(lData);
    };

    cargarDatos();
  }, [activeUnit, factura.mes, factura.anio]);

  // Cálculos matemáticos computados en tiempo real
  const consumoIndividual = (Number(lectura.actual) || 0) - Number(lectura.anterior);
  const costoGlobal = Number(factura.costo) || 0;
  const metrosGlobal = Number(factura.metros) || 0;
  const valorMetro = metrosGlobal > 0 ? (costoGlobal / metrosGlobal) : 0;
  const totalPagarIndividual = consumoIndividual > 0 ? consumoIndividual * valorMetro : 0;

  // ACCIÓN: Guardar Configuración de WhatsApp
  const guardarConfiguracion = async () => {
    setIsSaving(true);
    const { error } = await supabase
      .from('unidades')
      .update({ whatsapp: unidadData.whatsapp })
      .eq('nombre', activeUnit);
    setIsSaving(false);
    if (error) alert("Error: " + error.message);
    else setIsSettingsOpen(false);
  };

  // ACCIÓN: Guardar Factura General (Cierre del Periodo)
  const guardarFacturaGeneral = async () => {
    if (!factura.costo || !factura.metros) return alert("Error: Debe ingresar costo y metros del recibo.");
    setIsSaving(true);
    const { error } = await supabase.from('facturas_generales').upsert({
      mes: factura.mes,
      anio: Number(factura.anio),
      costo_total: costoGlobal,
      metros_totales: metrosGlobal,
      valor_metro: valorMetro
    }, { onConflict: 'mes, anio' });
    setIsSaving(false);
    if (error) alert("Error de base de datos: " + error.message);
    else alert("Factura global guardada. Precio establecido.");
  };

  // ACCIÓN: Guardar Lectura Individual y Cierre de Apartamento
  const guardarLectura = async () => {
    if (!lectura.actual || consumoIndividual < 0) return alert("Lectura inválida.");
    setIsSaving(true);
    
    const { error: errorL } = await supabase.from('lecturas').insert([{
      mes: factura.mes,
      anio: Number(factura.anio),
      unidad_id: unidadData.id,
      lectura_anterior: lectura.anterior,
      lectura_actual: lectura.actual,
      consumo: consumoIndividual,
      valor_pagar: totalPagarIndividual
    }]);

    const { error: errorU } = await supabase.from('unidades')
      .update({ lectura_inicial: Number(lectura.actual) })
      .eq('id', unidadData.id);

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
      state={{ activeTab, activeUnit, factura, lectura, unidadData, resumenLecturas, isSettingsOpen, isSaving }}
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
        
        {state.activeTab === 'factura' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl">
              <p className="text-xs text-zinc-500 uppercase font-bold mb-6 tracking-widest">Configuración del Periodo</p>
              <div className="space-y-4">
                <input type="number" value={state.factura.costo} onChange={(e) => actions.setFactura({...state.factura, costo: e.target.value})} placeholder="Costo Total Factura $" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-xl focus:border-indigo-500 focus:outline-none transition-all" />
                <input type="number" value={state.factura.metros} onChange={(e) => actions.setFactura({...state.factura, metros: e.target.value})} placeholder="Metros Totales Factura (m³)" className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-4 text-xl focus:border-indigo-500 focus:outline-none transition-all" />
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

        {state.activeTab === 'medidores' && (
          <div className="space-y-6">
            <nav className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {unidadesArr.map(u => (
                <button key={u} onClick={() => actions.setActiveUnit(u)} className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-medium transition-all border ${state.activeUnit === u ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500 border-white/5'}`}>{u}</button>
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

        {state.activeTab === 'balance' && (
          <div className="space-y-6">
            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl">
              <h3 className="text-xl font-medium mb-6">Estado del Edificio</h3>
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

      </main>

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

      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex gap-4 p-2 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-full shadow-2xl">
        <button onClick={() => actions.setActiveTab('factura')} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${state.activeTab === 'factura' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}><FileText size={22}/></button>
        <button onClick={() => actions.setActiveTab('medidores')} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${state.activeTab === 'medidores' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}><Droplets size={22}/></button>
        <button onClick={() => actions.setActiveTab('balance')} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${state.activeTab === 'balance' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:bg-zinc-800'}`}><BarChart3 size={22}/></button>
      </nav>
    </div>
  );
}