export default function Slide6() {
  return (
    <div className="w-screen h-screen overflow-hidden relative slide-grid bg-[#FAFBFC] font-body text-primary">
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="text-[1.25vw] font-bold uppercase tracking-[.14em]">FinTrack</div><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">05 / ДАННЫЕ</div></div>
        <div className="pt-[4vh]"><div className="mb-[1.5vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Источники и движение денег</div><h1 className="m-0 text-[4.4vw] font-extrabold leading-[1.02] tracking-[-.055em]">Банковские данные и операции</h1></div>
        <div className="mt-[4vh] grid flex-1 grid-cols-2 gap-[2vw]">
          <div className="slide-card rounded-[1.2vw] p-[2.5vw]"><div className="mb-[5vh] flex h-[6vw] w-[6vw] items-center justify-center rounded-[1vw] bg-[#DDF2F0] text-[3vw] font-extrabold text-accent">01</div><div className="space-y-[2.1vh] text-[2vw] leading-[1.2]"><div>Отдельный модуль подключений к банкам</div><div>Поддержка счетов и депозитов в пользовательском сценарии</div><div>Хранение операций по счетам</div></div></div>
          <div className="slide-card-soft rounded-[1.2vw] p-[2.5vw]"><div className="mb-[5vh] flex h-[6vw] w-[6vw] items-center justify-center rounded-[1vw] bg-[#1E3A5F] text-[3vw] font-extrabold text-white">02</div><div className="space-y-[2.1vh] text-[2vw] leading-[1.2]"><div>Категоризация доходов, расходов и инвестиций</div><div>Основа для единого финансового обзора</div></div><div className="mt-[7vh] flex items-end gap-[.8vw] border-b border-[#B9DFDC] pb-[1vh]"><div className="h-[6vw] w-[2vw] bg-[#B9DFDC]" /><div className="h-[9vw] w-[2vw] bg-[#85C8C3]" /><div className="h-[7vw] w-[2vw] bg-[#4EB0A9]" /><div className="h-[11vw] w-[2vw] bg-accent" /><div className="h-[8vw] w-[2vw] bg-[#1E3A5F]" /></div></div>
        </div>
      </div>
    </div>
  );
}
