import { Link } from "@tanstack/react-router";
export function PublicBrand() {
  return <Link to="/" className="brand public-brand" aria-label="Marvedge home"><span className="brand-mark">m<span /></span><span>marvedge<span className="brand-dot">.</span></span></Link>;
}