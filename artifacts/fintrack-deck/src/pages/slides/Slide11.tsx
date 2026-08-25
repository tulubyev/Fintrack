export default function Slide11() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#FAFBFC] font-body text-primary">
      <div className="absolute right-0 top-0 h-full w-[16vw] bg-[#1E3A5F]" />
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="h-[.65vw] w-[5vw] bg-accent" /><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">10 / PLATFORM</div></div>
        <div className="pt-[4vh]"><div className="mb-[1.5vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Сервисные границы</div><h1 className="m-0 text-[4.5vw] font-extrabold leading-[1.02] tracking-[-.055em]">Архитектура FinTrack</h1></div>
        <div className="relative mt-[5vh] grid flex-1 grid-cols-3 gap-[1.5vw]">
          <div className="slide-card rounded-[1vw] p-[2vw]"><div className="mb-[4vh] flex h-[5vw] w-[5vw] items-center justify-center rounded-[.8vw] bg-[#DDF2F0] text-[2vw] font-extrabold text-accent">01</div><div className="mb-[1.5vh] text-[1.6vw] font-bold uppercase tracking-[.08em] text-accent">Web-клиент</div><div className="text-[2.15vw] font-bold">React + Vite</div><div className="mt-[3vh] text-[1.7vw] leading-[1.25] text-[#64748B]">Контракты: OpenAPI и генерация клиентских хуков</div></div>
          <div className="slide-card rounded-[1vw] p-[2vw]"><div className="mb-[4vh] flex h-[5vw] w-[5vw] items-center justify-center rounded-[.8vw] bg-[#1E3A5F] text-[2vw] font-extrabold text-white">02</div><div className="mb-[1.5vh] text-[1.6vw] font-bold uppercase tracking-[.08em] text-accent">API и данные</div><div className="text-[2.15vw] font-bold">Express-сервис</div><div className="mt-[1.5vh] text-[2vw] font-bold">PostgreSQL через Drizzle ORM</div><div className="mt-[3vh] text-[1.7vw] leading-[1.25] text-[#64748B]">Валидация: Zod</div></div>
          <div className="slide-card-soft rounded-[1vw] p-[2vw]"><div className="mb-[4vh] flex h-[5vw] w-[5vw] items-center justify-center rounded-[.8vw] bg-accent text-[2vw] font-extrabold text-white">03</div><div className="mb-[1.5vh] text-[1.6vw] font-bold uppercase tracking-[.08em] text-accent">Сервисы</div><div className="space-y-[1.4vh] text-[1.95vw] font-bold leading-[1.15]"><div>Банки</div><div>Документы</div><div>Email</div><div>SMS</div><div>AI</div><div>Платежные сценарии</div></div></div>
        </div>
      </div>
    </div>
  );
}
