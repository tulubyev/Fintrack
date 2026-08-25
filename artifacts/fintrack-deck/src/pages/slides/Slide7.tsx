export default function Slide7() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#FAFBFC] font-body text-primary">
      <div className="absolute right-0 top-0 h-full w-[30vw] bg-[#EAF7F6]" />
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="h-[.65vw] w-[5vw] bg-accent" /><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">06 / ЦЕЛИ</div></div>
        <div className="pt-[4vh]"><div className="mb-[1.5vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Планы и активы</div><h1 className="m-0 text-[4.5vw] font-extrabold leading-[1.02] tracking-[-.055em]">Накопления и инвестиции</h1></div>
        <div className="mt-[5vh] grid flex-1 grid-cols-[1fr_1fr] gap-[2vw]">
          <div className="slide-card rounded-[1.1vw] p-[2.4vw]"><div className="flex items-center justify-between"><div className="text-[1.65vw] font-bold">Инвестиционные активы</div><div className="flex h-[3vw] w-[3vw] items-center justify-center rounded-full bg-accent text-[1.5vw] font-bold text-white">↗</div></div><div className="mt-[7vh] text-[4.1vw] font-extrabold leading-none tracking-[-.06em]">Инвестиционные активы</div><div className="mt-[4vh] h-[.8vw] w-full rounded-full bg-[#DCE5ED]"><div className="h-full w-[72%] rounded-full bg-accent" /></div><div className="mt-[2vh] text-[1.75vw] text-[#64748B]">Управление инвестиционными активами</div></div>
          <div className="slide-card rounded-[1.1vw] p-[2.4vw]"><div className="flex items-center justify-between"><div className="text-[1.65vw] font-bold">Сбережения и накопления</div><div className="flex h-[3vw] w-[3vw] items-center justify-center rounded-full bg-[#1E3A5F] text-[1.5vw] font-bold text-white">→</div></div><div className="mt-[5vh] flex items-end gap-[1vw]"><div className="h-[9vw] w-[3vw] rounded-t-[.4vw] bg-[#B9DFDC]" /><div className="h-[13vw] w-[3vw] rounded-t-[.4vw] bg-[#69BDB7]" /><div className="h-[17vw] w-[3vw] rounded-t-[.4vw] bg-accent" /></div><div className="mt-[3vh] text-[1.75vw] text-[#64748B]">Сбережения как отдельный финансовый сценарий</div></div>
          <div className="slide-card-soft rounded-[1.1vw] p-[2.4vw]"><div className="mb-[4vh] text-[1.65vw] font-bold">Бюджеты</div><div className="space-y-[2vh] text-[1.9vw] leading-[1.2]"><div className="flex items-center gap-[1vw]"><div className="h-[1.3vw] w-[1.3vw] rounded-full bg-accent" />Бюджеты помогают сопоставлять планы и операции</div></div></div>
          <div className="slide-card-soft rounded-[1.1vw] p-[2.4vw]"><div className="mb-[4vh] text-[1.65vw] font-bold">Модель данных</div><div className="flex items-center gap-[.8vw] text-[1.65vw]"><div className="rounded-[.5vw] bg-white px-[1vw] py-[1.2vw]">Счета</div><div className="text-accent">→</div><div className="rounded-[.5vw] bg-white px-[1vw] py-[1.2vw]">Транзакции</div><div className="text-accent">→</div><div className="rounded-[.5vw] bg-white px-[1vw] py-[1.2vw]">Цели</div></div><div className="mt-[3vh] text-[1.75vw] leading-[1.2]">Архитектура хранения разделяет счета, транзакции, бюджеты и цели</div></div>
        </div>
      </div>
    </div>
  );
}
