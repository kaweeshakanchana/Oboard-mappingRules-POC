import MappingRulesScreen from './MappingRulesScreen';

function App() {
  return (
    <div className="min-h-screen bg-gov-950 text-gov-100 flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1 flex flex-col overflow-hidden">
        <MappingRulesScreen />
      </main>
    </div>
  );
}

function AppHeader() {
  return (
    <header className="bg-gov-900 border-b border-gov-800 px-6 py-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-gradient-to-tr from-brand-indigo to-brand-cyan flex items-center justify-center font-bold text-white shadow-md shadow-brand-indigo/20">
          P
        </div>
        <div>
          <h1 className="text-md font-bold tracking-tight text-white flex items-center gap-2">
            PryGov Suite <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-indigo/20 text-brand-indigo border border-brand-indigo/30">Wizard</span>
          </h1>
          <p className="text-xs text-gov-400">Step 6.9 — Legacy Source Mapping Rules & Test Harness</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gov-800 text-gov-300 border border-gov-700">
          <span className="w-2 h-2 rounded-full bg-brand-emerald animate-pulse"></span>
          Connected to Legacy API
        </div>
        <span className="text-gov-500">v1.2.0-beta</span>
      </div>
    </header>
  );
}

export default App;
