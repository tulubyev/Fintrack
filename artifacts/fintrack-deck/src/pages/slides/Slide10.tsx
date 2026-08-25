export default function Slide10() {
  return (
    <div className="w-screen h-screen overflow-hidden relative slide-grid bg-[#FAFBFC] font-body text-primary">
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="text-[1.25vw] font-bold uppercase tracking-[.14em]">FinTrack</div><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">09 / КОНТРОЛЬ</div></div>
        <div className="grid flex-1 grid-cols-[.9fr_1.1fr] items-center gap-[6vw]">
          <div><div className="mb-[2vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Операционный контур</div><h1 className="m-0 text-[4.8vw] font-extrabold leading-[1.02] tracking-[-.06em]">Административный контур</h1><div className="mt-[4vh] max-w-[34vw] text-[1.9vw] leading-[1.3] text-[#64748B]">Отдельный путь для управления, проверки и наблюдаемости.</div></div>
          <div className="slide-card rounded-[1.3vw] p-[2.5vw]"><div className="mb-[2vw] flex items-center justify-between border-b border-[#DCE5ED] pb-[1.5vw]"><div className="text-[1.8vw] font-bold">Admin control plane</div><div className="rounded-full bg-[#DDF2F0] px-[1.2vw] py-[.7vw] text-[1.35vw] font-bold uppercase tracking-[.1em] text-accent">active</div></div><div className="space-y-[1.25vw]"><div className="flex items-center gap-[1.2vw] text-[1.9vw]"><div className="h-[1vw] w-[1vw] rounded-full bg-accent" />Управление пользователями и ролями</div><div className="flex items-center gap-[1.2vw] text-[1.9vw]"><div className="h-[1vw] w-[1vw] rounded-full bg-accent" />Проверка документов и история действий</div><div className="flex items-center gap-[1.2vw] text-[1.9vw]"><div className="h-[1vw] w-[1vw] rounded-full bg-accent" />Системное здоровье и операционные метрики</div><div className="flex items-center gap-[1.2vw] text-[1.9vw]"><div className="h-[1vw] w-[1vw] rounded-full bg-accent" />Контроль банковских и финансовых данных</div><div className="flex items-center gap-[1.2vw] text-[1.9vw]"><div className="h-[1vw] w-[1vw] rounded-full bg-accent" />Доступ к админ-панели отделён от обычного пользовательского сценария</div></div><div className="mt-[3vh] grid grid-cols-3 gap-[.8vw]"><div className="h-[4vw] rounded-[.5vw] bg-[#F1F7F7]" /><div className="h-[4vw] rounded-[.5vw] bg-[#DDF2F0]" /><div className="h-[4vw] rounded-[.5vw] bg-[#B9DFDC]" /></div></div>
        </div>
      </div>
    </div>
  );
}
