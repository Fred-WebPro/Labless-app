/**
 * Deterministic clinical indices computed from canonical marker values.
 * The language model never does this math; it only explains the results.
 */
export type IndexStatus = "optimal" | "normal" | "borderline" | "high" | "low";

export type IndexResult = {
  key: string;
  name: string;
  value: number;
  unit: string;
  status: IndexStatus;
  reference: string;
  inputs: string[];
  source: string;
};

export type Person = { age: number | null; sex: "male" | "female" | null };

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const has = (v: Record<string, number>, ...keys: string[]) => keys.every((k) => Number.isFinite(v[k]) && v[k] > 0);

export function computeIndices(v: Record<string, number>, person: Person): IndexResult[] {
  const out: IndexResult[] = [];
  const age = person.age;
  const glucose = v.glucose;

  if (has(v, "glucose", "insulin")) {
    const homa = (glucose * v.insulin) / 405;
    out.push({
      key: "homa_ir",
      name: "HOMA-IR",
      value: round(homa),
      unit: "",
      status: homa >= 2.9 ? "high" : homa >= 2.0 ? "borderline" : homa < 1.0 ? "optimal" : "normal",
      reference: "< 2.0 normal · 2.0–2.9 borderline · ≥ 2.9 insulin resistance",
      inputs: ["glucose", "insulin"],
      source: "Matthews 1985, Diabetologia",
    });
    const quicki = 1 / (Math.log10(v.insulin) + Math.log10(glucose));
    out.push({
      key: "quicki",
      name: "QUICKI",
      value: round(quicki, 3),
      unit: "",
      status: quicki < 0.339 ? "low" : "normal",
      reference: "≥ 0.339 normal insulin sensitivity",
      inputs: ["glucose", "insulin"],
      source: "Katz 2000, JCEM",
    });
    if (glucose > 63) {
      const homaB = (360 * v.insulin) / (glucose - 63);
      out.push({
        key: "homa_b",
        name: "HOMA-B",
        value: round(homaB, 0),
        unit: "%",
        status: homaB > 200 ? "high" : homaB < 60 ? "low" : "normal",
        reference: "~100% typical β-cell function",
        inputs: ["glucose", "insulin"],
        source: "Matthews 1985, Diabetologia",
      });
    }
  }

  if (has(v, "tg", "glucose")) {
    const tyg = Math.log((v.tg * glucose) / 2);
    out.push({
      key: "tyg",
      name: "TyG index",
      value: round(tyg),
      unit: "",
      status: tyg >= 8.8 ? "high" : tyg >= 8.5 ? "borderline" : "normal",
      reference: "< 8.5 normal · ≥ 8.8 insulin resistance likely",
      inputs: ["tg", "glucose"],
      source: "Simental-Mendía 2008, Metab Syndr Relat Disord",
    });
  }

  if (has(v, "tg", "hdl")) {
    const ratio = v.tg / v.hdl;
    out.push({
      key: "tg_hdl",
      name: "TG/HDL ratio",
      value: round(ratio),
      unit: "",
      status: ratio >= 3.5 ? "high" : ratio >= 2.5 ? "borderline" : "normal",
      reference: "< 2.5 favorable · ≥ 3.5 atherogenic pattern",
      inputs: ["tg", "hdl"],
      source: "McLaughlin 2003, Ann Intern Med",
    });
  }

  if (has(v, "chol_total", "hdl")) {
    const nonHdl = v.chol_total - v.hdl;
    out.push({
      key: "non_hdl",
      name: "Non-HDL cholesterol",
      value: round(nonHdl, 0),
      unit: "mg/dL",
      status: nonHdl >= 160 ? "high" : nonHdl >= 130 ? "borderline" : "normal",
      reference: "< 130 mg/dL desirable",
      inputs: ["chol_total", "hdl"],
      source: "NCEP ATP III",
    });
  }

  if (has(v, "ast", "alt", "plt") && age) {
    const fib4 = (age * v.ast) / (v.plt * Math.sqrt(v.alt));
    out.push({
      key: "fib4",
      name: "FIB-4",
      value: round(fib4),
      unit: "",
      status: fib4 > 2.67 ? "high" : fib4 >= 1.3 ? "borderline" : "normal",
      reference: "< 1.3 low risk of advanced fibrosis · > 2.67 high",
      inputs: ["ast", "alt", "plt", "age"],
      source: "Sterling 2006, Hepatology",
    });
  }

  if (has(v, "ast", "alt")) {
    const ratio = v.ast / v.alt;
    out.push({
      key: "de_ritis",
      name: "AST/ALT (De Ritis)",
      value: round(ratio),
      unit: "",
      status: ratio > 2 ? "high" : ratio < 0.8 ? "low" : "normal",
      reference: "0.8–2.0 typical · < 0.8 with high ALT suggests fatty liver",
      inputs: ["ast", "alt"],
      source: "De Ritis 1957",
    });
  }

  if (has(v, "creatinine") && age && person.sex) {
    const female = person.sex === "female";
    const k = female ? 0.7 : 0.9;
    const a = female ? -0.241 : -0.302;
    const scr = v.creatinine / k;
    const egfr = 142 * Math.min(scr, 1) ** a * Math.max(scr, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
    out.push({
      key: "egfr",
      name: "eGFR (CKD-EPI 2021)",
      value: round(egfr, 0),
      unit: "mL/min/1.73m²",
      status: egfr < 60 ? "low" : egfr < 90 ? "borderline" : "normal",
      reference: "≥ 90 normal · 60–89 mildly decreased · < 60 reduced",
      inputs: ["creatinine", "age", "sex"],
      source: "Inker 2021, NEJM",
    });
  }

  if (has(v, "bun", "creatinine")) {
    const ratio = v.bun / v.creatinine;
    out.push({
      key: "bun_creat",
      name: "BUN/creatinine",
      value: round(ratio, 1),
      unit: "",
      status: ratio > 20 ? "high" : ratio < 10 ? "low" : "normal",
      reference: "10–20 typical · > 20 dehydration pattern",
      inputs: ["bun", "creatinine"],
      source: "Clinical convention",
    });
  }

  const neut = has(v, "neut_abs") ? v.neut_abs : null;
  const lymph = has(v, "lymph_abs") ? v.lymph_abs : null;
  if (neut && lymph) {
    const nlr = neut / lymph;
    out.push({
      key: "nlr",
      name: "Neutrophil-to-lymphocyte ratio",
      value: round(nlr),
      unit: "",
      status: nlr >= 3 ? "high" : nlr < 0.7 ? "low" : "normal",
      reference: "0.7–3.0 typical",
      inputs: ["neut_abs", "lymph_abs"],
      source: "Forget 2017, BMC Res Notes",
    });
    if (has(v, "plt")) {
      const plr = v.plt / lymph;
      out.push({
        key: "plr",
        name: "Platelet-to-lymphocyte ratio",
        value: round(plr, 0),
        unit: "",
        status: plr > 180 ? "high" : "normal",
        reference: "~50–180 typical",
        inputs: ["plt", "lymph_abs"],
        source: "Clinical convention",
      });
    }
  } else if (has(v, "neut_pct", "lymph_pct")) {
    const nlr = v.neut_pct / v.lymph_pct;
    out.push({
      key: "nlr",
      name: "Neutrophil-to-lymphocyte ratio",
      value: round(nlr),
      unit: "",
      status: nlr >= 3 ? "high" : nlr < 0.7 ? "low" : "normal",
      reference: "0.7–3.0 typical",
      inputs: ["neut_pct", "lymph_pct"],
      source: "Forget 2017, BMC Res Notes",
    });
  }

  if (has(v, "mcv", "rbc")) {
    const mentzer = v.mcv / v.rbc;
    out.push({
      key: "mentzer",
      name: "Mentzer index",
      value: round(mentzer, 1),
      unit: "",
      status: mentzer < 13 && v.mcv < 80 ? "low" : "normal",
      reference: "> 13 favors iron deficiency over thalassemia trait when MCV is low",
      inputs: ["mcv", "rbc"],
      source: "Mentzer 1973, Lancet",
    });
  }

  if (has(v, "iron", "tibc") && !has(v, "transferrin_sat")) {
    const tsat = (v.iron / v.tibc) * 100;
    out.push({
      key: "tsat",
      name: "Transferrin saturation",
      value: round(tsat, 0),
      unit: "%",
      status: tsat < 20 ? "low" : tsat > 45 ? "high" : "normal",
      reference: "20–45%",
      inputs: ["iron", "tibc"],
      source: "Clinical convention",
    });
  }

  const crp = has(v, "hs_crp") ? v.hs_crp : has(v, "crp") ? v.crp : null;
  if (crp && age && has(v, "albumin", "creatinine", "glucose", "lymph_pct", "mcv", "rdw_cv", "alp", "wbc")) {
    const xb =
      -19.907 -
      0.0336 * (v.albumin * 10) +
      0.0095 * (v.creatinine * 88.4) +
      0.1953 * (glucose / 18.016) +
      0.0954 * Math.log(crp / 10) -
      0.012 * v.lymph_pct +
      0.0268 * v.mcv +
      0.3306 * v.rdw_cv +
      0.00188 * v.alp +
      0.0554 * v.wbc +
      0.0804 * age;
    const m = 1 - Math.exp((-1.51714 * Math.exp(xb)) / 0.0076927);
    if (m > 0 && m < 1) {
      const pheno = 141.50225 + Math.log(-0.00553 * Math.log(1 - m)) / 0.090165;
      if (Number.isFinite(pheno)) {
        const delta = pheno - age;
        out.push({
          key: "phenoage",
          name: "Biological age (PhenoAge)",
          value: round(pheno, 1),
          unit: "years",
          status: delta > 2 ? "high" : delta < -2 ? "optimal" : "normal",
          reference: `Chronological age ${age}`,
          inputs: ["albumin", "creatinine", "glucose", "crp", "lymph_pct", "mcv", "rdw_cv", "alp", "wbc", "age"],
          source: "Levine 2018, Aging",
        });
      }
    }
  }

  return out;
}

export function ageFrom(birthDate: string | null, at: Date = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
