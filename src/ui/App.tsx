import { useState } from "react";
import { APITester } from "./APITester";

export function App() {
  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <header className="mb-10 pb-6 border-b border-white/10">
        <h1 className="text-3xl font-bold tracking-tight">Companio</h1>
        <p className="text-sm text-white/40 mt-1">Dashboard</p>
      </header>
      <main>
        <APITester />
      </main>
    </div>
  );
}

export default App;
