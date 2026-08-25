export default function Slide3() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#FAFBFC] font-body text-primary">
      <div className="absolute inset-0 slide-dot-grid opacity-40" />
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="flex items-center gap-[1vw]"><div className="h-[.9vw] w-[.9vw] rounded-full bg-accent" /><div className="text-[1.25vw] font-bold uppercase tracking-[.14em]">FinTrack</div></div><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">02 / ПРОДУКТ</div></div>
        <div className="flex items-end justify-between pt-[4vh]"><h1 className="m-0 max-w-[61vw] text-[4.15vw] font-extrabold leading-[1.04] tracking-[-.05em]">Один продукт — пять финансовых сценариев</h1><div className="mb-[.8vh] text-[5.2vw] font-extrabold leading-none text-accent/20">05</div></div>
        <div className="mt-[4vh] grid flex-1 grid-cols-3 grid-rows-2 gap-[1.5vw]">
          <div className="slide-card rounded-[1vw] p-[2vw]"><div className="mb-[5vh] text-[3.2vw] font-extrabold text-accent">01</div><div className="text-[2vw] font-bold leading-[1.18]">Банковские подключения и счета</div></div>
          <div className="slide-card rounded-[1vw] p-[2vw]"><div className="mb-[5vh] text-[3.2vw] font-extrabold text-accent">02</div><div className="text-[2vw] font-bold leading-[1.18]">История операций и категории</div></div>
          <div className="slide-card rounded-[1vw] p-[2vw]"><div className="mb-[5vh] text-[3.2vw] font-extrabold text-accent">03</div><div className="text-[2vw] font-bold leading-[1.18]">Бюджеты и финансовые цели</div></div>
          <div className="slide-card rounded-[1vw] p-[2vw]"><div className="mb-[5vh] text-[3.2vw] font-extrabold text-accent">04</div><div className="text-[2vw] font-bold leading-[1.18]">Сбережения и накопления</div></div>
          <div className="slide-card rounded-[1vw] p-[2vw]"><div className="mb-[5vh] text-[3.2vw] font-extrabold text-accent">05</div><div className="text-[2vw] font-bold leading-[1.18]">Инвестиционные активы</div></div>
          <div className="slide-card-soft rounded-[1vw] p-[2vw]"><div className="mb-[5vh] text-[3.2vw] font-extrabold text-primary/35">06</div><div className="text-[2vw] font-bold leading-[1.18]">Профиль, документы и подтверждение личности</div></div>
        </div>
      </div>
    </div>
  );
}
