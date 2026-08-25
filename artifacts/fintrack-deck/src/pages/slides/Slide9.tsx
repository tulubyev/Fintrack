export default function Slide9() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#FAFBFC] font-body text-primary">
      <div className="absolute bottom-0 left-0 h-[32vh] w-full bg-[#F1F7F7]" />
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="h-[.65vw] w-[5vw] bg-accent" /><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">08 / ВЕРИФИКАЦИЯ</div></div>
        <div className="grid flex-1 grid-cols-[.8fr_1.2fr] items-center gap-[5vw]">
          <div><div className="mb-[2vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Контур подтверждения</div><h1 className="m-0 text-[4.6vw] font-extrabold leading-[1.02] tracking-[-.055em]">Документы и подтверждение данных</h1></div>
          <div className="slide-card rounded-[1.3vw] p-[2.5vw]"><div className="mb-[2vw] text-[1.75vw] font-bold">Поток документа</div><div className="flex items-center justify-between"><div className="flex w-[12vw] flex-col items-center text-center"><div className="flex h-[6vw] w-[6vw] items-center justify-center rounded-[1vw] bg-[#DDF2F0] text-[2.5vw] text-accent">+</div><div className="mt-[1.5vh] text-[1.65vw] font-bold">Загрузка документов через отдельный сервис</div></div><div className="text-[2.4vw] text-accent">→</div><div className="flex w-[12vw] flex-col items-center text-center"><div className="flex h-[6vw] w-[6vw] items-center justify-center rounded-[1vw] bg-[#DDF2F0] text-[1.55vw] font-bold text-accent">PDF</div><div className="mt-[1.5vh] text-[1.65vw] font-bold">Обработка изображений и PDF</div></div><div className="text-[2.4vw] text-accent">→</div><div className="flex w-[12vw] flex-col items-center text-center"><div className="flex h-[6vw] w-[6vw] items-center justify-center rounded-[1vw] bg-[#1E3A5F] text-[1.55vw] font-bold text-white">OK</div><div className="mt-[1.5vh] text-[1.65vw] font-bold">Статусы проверки: pending, verified и архивирование</div></div></div><div className="mt-[4vh] grid grid-cols-2 gap-[1vw]"><div className="rounded-[.8vw] bg-[#F1F7F7] p-[1.5vw] text-[1.8vw] leading-[1.2]">История решений по верификации</div><div className="rounded-[.8vw] bg-[#F1F7F7] p-[1.5vw] text-[1.8vw] leading-[1.2]">Файлы отделены от прикладной логики через слой хранения</div></div></div>
        </div>
      </div>
    </div>
  );
}
