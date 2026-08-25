export default function Slide15() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#1E3A5F] font-body text-white">
      <div className="absolute inset-0 opacity-20" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)', backgroundSize: '4vw 4vw'}} />
      <div className="absolute -right-[8vw] -top-[18vh] h-[62vh] w-[50vw] rounded-full border border-[#67C7C0]/35" />
      <div className="absolute -right-[1vw] -top-[4vh] h-[35vh] w-[29vw] rounded-full border border-[#67C7C0]/20" />
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-white/20 pb-[2vh]"><div className="flex items-center gap-[1vw]"><div className="h-[2vw] w-[2vw] rounded-[.45vw] bg-[#67C7C0]" /><div className="text-[1.2vw] font-bold tracking-[.04em]">FINTRACK</div></div><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-white/55">14 / ROADMAP</div></div>
        <div className="grid flex-1 grid-cols-[.85fr_1.15fr] items-center gap-[6vw]">
          <div><div className="mb-[2vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-[#67C7C0]">Ближайшие приоритеты</div><h1 className="m-0 text-[5.8vw] font-extrabold leading-[.98] tracking-[-.07em]">Следующий этап</h1><div className="mt-[4vh] text-[2.2vw] leading-[1.2] text-white/70">FinTrack готов развиваться как единая финансовая платформа</div></div>
          <div className="space-y-[1.1vw]"><div className="rounded-[.9vw] border border-white/15 bg-white/8 p-[1.7vw] text-[1.95vw] leading-[1.2]">Стабилизировать сетевой доступ production к PostgreSQL</div><div className="rounded-[.9vw] border border-white/15 bg-white/8 p-[1.7vw] text-[1.95vw] leading-[1.2]">Зафиксировать безопасную схему доступа вместо динамического allowlist</div><div className="rounded-[.9vw] border border-white/15 bg-white/8 p-[1.7vw] text-[1.95vw] leading-[1.2]">Завершить аудит зависимостей и устранить уязвимости</div><div className="rounded-[.9vw] border border-white/15 bg-white/8 p-[1.7vw] text-[1.95vw] leading-[1.2]">Усилить health checks и эксплуатационные runbooks</div></div>
        </div>
      </div>
    </div>
  );
}
