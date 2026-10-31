import type { ResumeSectionType } from "@/lib/schemas/resume";

type Lang = "en" | "ar";

/** Standard, ATS-recognisable section headings. */
export const SECTION_HEADINGS: Record<Lang, Record<ResumeSectionType, string>> = {
  en: {
    summary: "Professional Summary",
    education: "Education",
    skills: "Technical Skills",
    experience: "Work Experience",
    internships: "Internship Experience",
    research: "Research Experience",
    projects: "Selected Projects",
    leadership: "Leadership Experience",
    volunteer: "Volunteer Experience",
    certifications: "Certifications",
    publications: "Publications",
    awards: "Awards and Achievements",
    languages: "Languages",
    additional: "Additional Information",
    custom: "Additional Section",
  },
  ar: {
    summary: "الملخص المهني",
    education: "التعليم",
    skills: "المهارات التقنية",
    experience: "الخبرة العملية",
    internships: "التدريب العملي",
    research: "الخبرة البحثية",
    projects: "مشاريع مختارة",
    leadership: "الخبرة القيادية",
    volunteer: "العمل التطوعي",
    certifications: "الشهادات",
    publications: "المنشورات",
    awards: "الجوائز والإنجازات",
    languages: "اللغات",
    additional: "معلومات إضافية",
    custom: "قسم إضافي",
  },
};

export const RESUME_TERMS: Record<Lang, Record<string, string>> = {
  en: {
    present: "Present",
    expected: "Expected",
    gpa: "GPA",
    coursework: "Relevant coursework",
    honors: "Honors",
    thesis: "Thesis",
    minor: "Minor",
    score: "Score",
    authors: "Authors",
    github: "GitHub",
    demo: "Demo",
    docs: "Documentation",
    linkedin: "LinkedIn",
    portfolio: "Portfolio",
    dob: "Date of birth",
    nationality: "Nationality",
    expires: "Expires",
    otherSkills: "Skills",
    softSkills: "Professional Skills",
  },
  ar: {
    present: "حتى الآن",
    expected: "متوقع",
    gpa: "المعدل",
    coursework: "مقررات ذات صلة",
    honors: "مرتبة الشرف",
    thesis: "مشروع التخرج / الأطروحة",
    minor: "تخصص فرعي",
    score: "الدرجة",
    authors: "المؤلفون",
    github: "GitHub",
    demo: "عرض تجريبي",
    docs: "التوثيق",
    linkedin: "LinkedIn",
    portfolio: "الموقع الشخصي",
    dob: "تاريخ الميلاد",
    nationality: "الجنسية",
    expires: "تنتهي",
    otherSkills: "المهارات",
    softSkills: "المهارات المهنية",
  },
};

/** Labels for enumerated profile values that appear on a resume. */
export const ENUM_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    published: "Published",
    accepted: "Accepted for publication",
    under_review: "Under review",
    in_preparation: "In preparation",
    presented: "Presented",
    not_published: "Unpublished",
    patent_application: "Patent application",
    patent_granted: "Granted patent",
    native: "Native",
    fluent: "Fluent",
    advanced: "Advanced",
    intermediate: "Intermediate",
    basic: "Basic",
    percentage: "%",
  },
  ar: {
    published: "منشور",
    accepted: "مقبول للنشر",
    under_review: "قيد المراجعة",
    in_preparation: "قيد الإعداد",
    presented: "تم تقديمه",
    not_published: "غير منشور",
    patent_application: "طلب براءة اختراع",
    patent_granted: "براءة اختراع ممنوحة",
    native: "اللغة الأم",
    fluent: "طلاقة",
    advanced: "متقدم",
    intermediate: "متوسط",
    basic: "مبتدئ",
    percentage: "%",
  },
};

export function formatMonth(date: string | null | undefined, lang: Lang): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  // Latin digits keep dates machine-readable for ATS parsers in both languages.
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatRange(
  start: string | null | undefined,
  end: string | null | undefined,
  lang: Lang,
  opts: { current?: boolean; expected?: boolean } = {},
): string {
  const t = RESUME_TERMS[lang];
  const s = formatMonth(start, lang);
  const e = opts.current ? t.present : formatMonth(end, lang);
  const endLabel = opts.expected && e ? `${t.expected} ${e}` : e;
  if (s && endLabel) return `${s} – ${endLabel}`;
  return s || endLabel;
}
