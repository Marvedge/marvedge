import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowRight, Play, Video, MousePointer2, CalendarDays, Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/account";
import studio from "@/assets/landing-studio.jpg";
import { PublicBrand } from "./brand";
import { ThemeToggle } from "@/components/theme-toggle";

export function LandingPage() {
  const { user, signOut, loading } = useAccount();
  return <div className="public-site">
    <header className="public-header"><PublicBrand /><nav aria-label="Main navigation"><Button variant="ghost" asChild><Link to="/help">Help center <ArrowUpRight /></Link></Button></nav><div className="public-header-actions"><ThemeToggle />{user ? <><Button variant="ghost" size="icon" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut /></Button><Button asChild><Link to="/home">Open workspace <ArrowUpRight /></Link></Button></> : <><Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button><Button disabled={loading} asChild><Link to="/sign-up">Get started <ArrowUpRight /></Link></Button></>}</div></header>
    <main>
      <section className="landing-hero"><img src={studio} alt="A laptop with a video editing timeline, a presenter video and a camera in a bright creative studio" width={1536} height={1024} fetchPriority="high" /><div className="landing-hero-copy"><div className="landing-eyebrow"><span /> A LITTLE MORE POSSIBILITY</div><h1>Marvedge<span>.</span></h1><h2>Your product.<br />A story worth showing.</h2><p>Turn screen recordings into interactive demos and video drafts. Give your next big idea a little more life.</p><div className="landing-cta"><Button size="lg" asChild><Link to={user ? "/home" : "/sign-up"}>{user ? "Open your workspace" : "Start creating"}<ArrowRight /></Link></Button><Button variant="outline" size="lg" asChild><Link to="/auth"><Play /> Sign in to explore</Link></Button></div><div className="landing-small"><Check size={14} /> Your ideas. Your creative space.</div></div><span className="hero-caption">FROM THE FIRST FRAME TO THE BIG PICTURE</span></section>
      <section className="landing-workflow"><div className="landing-section-heading"><span className="eyebrow">ONE SPACE. EVERY CREATIVE STEP.</span><h2>Make something worth a closer look.</h2><p>Capture, shape, and organize your next story.</p></div><div className="landing-feature-grid">{[{icon:Video,number:"01",title:"Capture the moment",text:"Record your screen or bring your own video into a project."},{icon:MousePointer2,number:"02",title:"Make it your own",text:"Arrange scenes, add text and callouts, and preview interactions."},{icon:CalendarDays,number:"03",title:"Plan the next move",text:"Organize media and prepare posts in your upload calendar."}].map(f=><article key={f.number}><div><f.icon /><span>{f.number}</span></div><h3>{f.title}</h3><p>{f.text}</p></article>)}</div><p className="landing-status">Projects and media currently stay in your session. Automatic publishing and final video rendering are not connected.</p></section>
      <section className="landing-end"><span className="eyebrow">YOUR NEXT BIG IDEA STARTS HERE</span><h2>Give it a space to grow.</h2><Button size="lg" asChild><Link to={user ? "/home" : "/sign-up"}>Let's make something <ArrowUpRight /></Link></Button></section>
    </main><footer className="public-footer"><PublicBrand /><span>Made for your next big idea.</span><Link to="/auth">Sign in <ArrowUpRight size={14} /></Link></footer>
  </div>;
}