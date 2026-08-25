const base = import.meta.env.BASE_URL;

export default function Slide1() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#FAFBFC] font-body text-primary">
      <div className="absolute inset-0 slide-grid" />
      <div className="absolute -right-[7vw] -top-[14vh] h-[58vh] w-[48vw] rounded-full bg-[#DDF2F0] opacity-70" />
      <div className="absolute bottom-[6vh] left-[4vw] h-[10vw] w-[10vw] rounded-full border border-[#0D9488]/20" />
      <div className="absolute bottom-[10vh] left-[8vw] h-[2vw] w-[2vw] rounded-full bg-[#0D9488]" />
      <div className="relative z-10 flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center justify-between border-b border-[#DCE5ED] pb-[2vh]">
          <div className="flex items-center gap-[1vw]"><div className="h-[2vw] w-[2vw] rounded-[.45vw] bg-[#0D9488]" /><div className="text-[1.2vw] font-bold tracking-[.04em]">FINTRACK</div></div>
          <div className="text-[1.45vw] font-medium uppercase tracking-[.14em] text-[#64748B]">ФИНАНСОВАЯ ПЛАТФОРМА</div>
        </div>
        <div className="grid flex-1 grid-cols-[1.05fr_.95fr] items-center gap-[5vw]">
          <div className="max-w-[45vw]">
            <div className="mb-[2vh] flex items-center gap-[1vw] text-[1.45vw] font-bold uppercase tracking-[.18em] text-accent"><div className="h-[.3vw] w-[3vw] bg-accent" /> FinTrack</div>
            <h1 className="m-0 text-[6.5vw] font-extrabold leading-[.96] tracking-[-.07em]">FinTrack</h1>
            <div className="mt-[3vh] max-w-[39vw] space-y-[1vh] text-[2.2vw] leading-[1.25] text-[#475569]"><p className="m-0">Умный финансовый агрегатор</p><p className="m-0 font-medium text-primary">Единое пространство для банков, операций, накоплений и инвестиций</p></div>
          </div>
          <div className="relative h-[58vh] overflow-hidden rounded-[1.4vw] border border-white/80 shadow-[0_1.5vw_4vw_rgba(30,58,95,.16)]">
            <img src={base + 'fintrack-hero.png'} crossOrigin="anonymous" className="h-full w-full object-cover" alt="" />
            <div className="absolute inset-0 bg-gradient-to-tr from-[#1E3A5F]/75 via-[#1E3A5F]/15 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
