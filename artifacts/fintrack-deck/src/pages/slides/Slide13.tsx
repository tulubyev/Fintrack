export default function Slide13() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#FAFBFC] font-body text-primary">
      <div className="relative flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]"><div className="h-[.65vw] w-[5vw] bg-accent" /><div className="text-[1.35vw] font-bold uppercase tracking-[.16em] text-[#64748B]">12 / DELIVERY</div></div>
        <div className="pt-[4vh]"><div className="mb-[1.5vh] text-[1.55vw] font-bold uppercase tracking-[.16em] text-accent">Среды и артефакты</div><h1 className="m-0 text-[4.5vw] font-extrabold leading-[1.02] tracking-[-.055em]">Разработка и production</h1></div>
        <div className="mt-[5vh] grid flex-1 grid-cols-2 gap-[2vw]">
          <div className="slide-card rounded-[1.2vw] p-[2.5vw]"><div className="flex items-center justify-between"><div className="text-[1.8vw] font-bold">Dev</div><div className="rounded-full bg-[#DDF2F0] px-[1.2vw] py-[.7vw] text-[1.3vw] font-bold uppercase tracking-[.12em] text-accent">verified</div></div><div className="mt-[6vh] text-[3.1vw] font-extrabold leading-[1.05]">multi-artifact<br />PNPM workspace</div><div className="mt-[5vh] space-y-[1.5vh] text-[1.9vw] leading-[1.2]"><div>Отдельные артефакты: FinTrack web, API Server и Canvas</div><div>Dev-подключение к VPS проверено успешно</div></div></div>
          <div className="slide-card-soft rounded-[1.2vw] p-[2.5vw]"><div className="flex items-center justify-between"><div className="text-[1.8vw] font-bold">Production</div><div className="rounded-full bg-[#FFF4E5] px-[1.2vw] py-[.7vw] text-[1.3vw] font-bold uppercase tracking-[.12em] text-[#B7791F]">network check</div></div><div className="mt-[6vh] text-[3.1vw] font-extrabold leading-[1.05]">Опубликованное<br />приложение</div><div className="mt-[5vh] space-y-[1.5vh] text-[1.9vw] leading-[1.2]"><div>Production-приложение опубликовано, но доступ к PostgreSQL зависит от firewall allowlist</div><div>Production и dev требуют раздельной проверки сетевого доступа</div></div></div>
        </div>
      </div>
    </div>
  );
}
