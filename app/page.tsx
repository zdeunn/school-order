"use client";

import { useState, useRef, useEffect } from "react";
import { 
  GraduationCap, 
  Camera, 
  Trash2, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  MapPin,
  User,
  Phone,
  FileText,
  ListCheck,
  Plus
} from "lucide-react";
import productsData from "../data/products.json";

// القوائم الجاهزة حسب المراحل والسنوات الدراسية (مصدرها ملف بيانات خارجي)
type PremadeLevel = {
  name: string;
  stage: string;
  items: { item: string; quantity: number }[];
};

const PREMADE_DATA = productsData as Record<string, PremadeLevel>;

// ترتيب الشعب داخل كل سنة (الأولوية للتخصصات العلمية ثم الأدبية...)
const TRACK_ORDER = ["sci", "math", "tech", "lit", "lang", "funun", "mgmt"];

const YEAR_LABELS: Record<string, string> = {
  "1": "السنة الأولى",
  "2": "السنة الثانية",
  "3": "السنة الثالثة",
  "4": "السنة الرابعة",
  "5": "السنة الخامسة",
};

type PremadeOption = { key: string; name: string; trackRank: number };

// تجميع المستويات حسب المرحلة الدراسية (stage) ثم حسب السنة، مع ترتيب ثابت (غير عشوائي)
const PREMADE_PHASES: Record<string, Record<string, PremadeOption[]>> = Object.entries(
  PREMADE_DATA
).reduce((acc, [key, level]) => {
  const yearMatch = key.match(/^(\d+)/);
  const yearNum = yearMatch ? yearMatch[1] : "0";
  const yearLabel = YEAR_LABELS[yearNum] || `السنة ${yearNum}`;

  const trackSuffix = key.split("_")[1] || "";
  const trackRank = TRACK_ORDER.indexOf(trackSuffix);

  if (!acc[level.stage]) acc[level.stage] = {};
  if (!acc[level.stage][yearLabel]) acc[level.stage][yearLabel] = [];
  acc[level.stage][yearLabel].push({
    key,
    name: level.name,
    trackRank: trackRank === -1 ? 999 : trackRank,
  });

  return acc;
}, {} as Record<string, Record<string, PremadeOption[]>>);

// ترتيب الشعب أبجدياً/منطقياً داخل كل سنة
Object.values(PREMADE_PHASES).forEach((years) => {
  Object.values(years).forEach((options) => {
    options.sort((a, b) => a.trackRank - b.trackRank || a.name.localeCompare(b.name, "ar"));
  });
});

interface OrderItem {
  name: string;
  quantity: number;
}

export default function CustomListOrderPage() {
  // حالات التحكم في القوائم الجاهزة
  const [isMainPremadeOpen, setIsMainPremadeOpen] = useState(false);
  const [openPhase, setOpenPhase] = useState<string | null>(null);

  // حالات الكاميرا المباشرة
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // حالات جدول المنتجات (مع استرجاع القائمة من التخزين المحلي إن وجدت، لتفادي فقدانها عند تحديث الصفحة بالخطأ)
  const [items, setItems] = useState<OrderItem[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState<number | "">(1);
  const [itemPendingDelete, setItemPendingDelete] = useState<number | null>(null);

  // حالات معلومات التوصيل والملاحظات
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // جمل الانتظار المتغيرة أثناء تحليل الصورة بالذكاء الاصطناعي
  const SCAN_MESSAGES = [
    "جار التعامل مع الصورة بالذكاء الاصطناعي...",
    "جار قراءة العناصر واحداً تلو الآخر...",
    "لم يتبق الكثير، اقتربنا من الانتهاء...",
    "جار تجهيز آخر عنصر في القائمة...",
  ];
  const [scanMsgIndex, setScanMsgIndex] = useState(0);

  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const newItemNameRef = useRef<HTMLInputElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const itemInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
  const [pendingPresetLevel, setPendingPresetLevel] = useState<string | null>(null);

  // استرجاع القائمة المحفوظة محلياً عند فتح الصفحة (لحمايتها من الفقدان عند التحديث بالخطأ)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("school_order_items");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setItems(parsed);
      }
    } catch {
      // تجاهل أي خطأ في القراءة من التخزين المحلي
    }
  }, []);

  // حفظ القائمة محلياً كلما تغيّرت
  useEffect(() => {
    try {
      localStorage.setItem("school_order_items", JSON.stringify(items));
    } catch {
      // تجاهل أي خطأ في الكتابة على التخزين المحلي
    }
  }, [items]);

  // إخفاء رسالة الحالة تلقائياً بعد مدة قصيرة (كإشعار عابر)
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // تدوير جمل الانتظار أثناء تحليل الصورة
  useEffect(() => {
    if (!isScanning) {
      setScanMsgIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setScanMsgIndex((prev) => (prev + 1) % SCAN_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  // إيقاف الكاميرا تلقائياً إن غادر المستخدم الصفحة أو المكوّن أثناء تشغيلها
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // التركيز التلقائي على الحقل الجديد بعد إضافته وسط القائمة
  useEffect(() => {
    if (pendingFocusIndex !== null) {
      itemInputRefs.current[pendingFocusIndex]?.focus();
      setPendingFocusIndex(null);
    }
  }, [items, pendingFocusIndex]);

  // اختيار السنة لتنزيل أدواتها تلقائياً والتمرير نحو قسم المراجعة
  const handleSelectYear = (levelKey: string) => {
    const level = PREMADE_DATA[levelKey];
    if (!level) return;

    if (items.length > 0) {
      // نسأل المستخدم: دمج القائمتين أم استبدال القائمة الحالية بالكامل
      setPendingPresetLevel(levelKey);
      return;
    }

    applyPresetItems(levelKey, "replace");
  };

  // تطبيق القائمة الجاهزة: دمج (جمع كميات العناصر المشتركة) أو استبدال كامل
  const applyPresetItems = (levelKey: string, mode: "merge" | "replace") => {
    const level = PREMADE_DATA[levelKey];
    if (!level) return;

    const incoming = level.items.map((i) => ({ name: i.item, quantity: i.quantity }));

    if (mode === "merge") {
      setItems((prev) => {
        const merged = [...prev];
        incoming.forEach((inc) => {
          const idx = merged.findIndex((m) => m.name.trim() === inc.name.trim());
          if (idx !== -1) {
            merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + inc.quantity };
          } else {
            merged.push({ ...inc });
          }
        });
        return merged;
      });
    } else {
      setItems(incoming);
    }

    setPendingPresetLevel(null);
    setTimeout(() => {
      reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // فتح/إغلاق الكاميرا
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: "تعذر فتح الكاميرا، يرجى التحقق من الصلاحيات" });
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  // التقاط الصورة وتحليلها بالذكاء الاصطناعي
  const captureAndScan = async () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    stopCamera();

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setIsScanning(true);
      setStatusMessage(null);

      const formData = new FormData();
      formData.append("image", blob, "captured_list.jpg");

      try {
        const res = await fetch("/api/scan-image", { method: "POST", body: formData });
        const data = await res.json();

        if (res.ok && data.items) {
          setItems((prev) => [...prev, ...data.items]);
          setStatusMessage({ type: "success", text: "تم قراءة القائمة وتنزيل العناصر بنجاح!" });
          setTimeout(() => {
            reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        } else {
          throw new Error(data.error || "فشل التعرف على صورة القائمة");
        }
      } catch (err: any) {
        setStatusMessage({ type: "error", text: err.message || "حدث خطأ أثناء قراءة الصورة" });
      } finally {
        setIsScanning(false);
      }
    }, "image/jpeg");
  };

  // الإضافة التلقائية عند الضغط على Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!newItemName.trim()) {
        newItemNameRef.current?.focus();
        return;
      }

      // لا نسمح بالإضافة إذا كان هناك عنصر آخر في القائمة لم يُستكمل اسمه بعد
      const emptyIndex = items.findIndex((it) => !it.name.trim());
      if (emptyIndex !== -1) {
        itemInputRefs.current[emptyIndex]?.focus();
        setStatusMessage({ type: "error", text: "يرجى إكمال اسم المنتج الحالي قبل إضافة منتج جديد" });
        return;
      }

      const qty = newItemQty === "" || newItemQty < 1 ? 1 : Number(newItemQty);
      setItems((prev) => [...prev, { name: newItemName.trim(), quantity: qty }]);
      setNewItemName("");
      setNewItemQty(1);
      // إبقاء التركيز داخل الحقل لمنع القفز التلقائي للحقل التالي في الهاتف
      setTimeout(() => newItemNameRef.current?.focus(), 0);
    }
  };

  // تعديل عناصر القائمة (بأسلوب immutable آمن مع React)
  const handleRequestRemoveItem = (index: number) => {
    setItemPendingDelete(index);
  };

  const confirmRemoveItem = () => {
    if (itemPendingDelete === null) return;
    setItems((prev) => prev.filter((_, i) => i !== itemPendingDelete));
    setItemPendingDelete(null);
  };

  const cancelRemoveItem = () => setItemPendingDelete(null);

  // إظهار الحقل فوق لوحة مفاتيح الهاتف عند التركيز عليه
  const scrollFieldIntoView = (e: React.FocusEvent<HTMLElement>) => {
    const target = e.target;
    setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
  };

  // حقل العنوان هو الأخير قبل زر الإرسال، لذا نُظهر الزر معه فوق لوحة المفاتيح
  const scrollLocationAndSubmitIntoView = (e: React.FocusEvent<HTMLElement>) => {
    setTimeout(() => {
      submitButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  };

  const handleClearAllItems = () => {
    if (items.length === 0) return;
    const confirmed = window.confirm("هل تريد تفريغ القائمة بالكامل؟ لا يمكن التراجع عن هذا الإجراء.");
    if (confirmed) setItems([]);
  };

  const handleItemNameChange = (index: number, newName: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, name: newName } : it)));
  };

  // إخفاء العنصر تلقائياً إن بقي فارغ الاسم عند الانتقال (focus) إلى عنصر آخر
  const handleItemBlur = (index: number) => {
    setItems((prev) => {
      if (prev[index] && !prev[index].name.trim()) {
        return prev.filter((_, i) => i !== index);
      }
      return prev;
    });
  };

  // إضافة عنصر جديد فارغ مباشرة تحت العنصر الحالي عند الضغط على Enter/استمرار في لوحة المفاتيح
  const handleItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // لا نسمح بإضافة عنصر جديد قبل استكمال اسم العنصر الحالي
      if (!items[index].name.trim()) return;

      setItems((prev) => {
        const updated = [...prev];
        updated.splice(index + 1, 0, { name: "", quantity: 1 });
        return updated;
      });
      setPendingFocusIndex(index + 1);
    }
  };

  // إضافة عنصر جديد فارغ في بداية القائمة (أعلى العناصر الحالية) عبر أيقونة "+"
  const handleAddEmptyItem = () => {
    const emptyIndex = items.findIndex((it) => !it.name.trim());
    if (emptyIndex !== -1) {
      // يوجد بالفعل عنصر لم يُستكمل اسمه، نوجّه التركيز إليه بدل إضافة عنصر جديد
      itemInputRefs.current[emptyIndex]?.focus();
      setStatusMessage({ type: "error", text: "يرجى إكمال اسم المنتج الحالي قبل إضافة منتج جديد" });
      return;
    }
    setItems((prev) => [{ name: "", quantity: 1 }, ...prev]);
    setPendingFocusIndex(0);
  };

  const handleQuantityChange = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, quantity: newQty } : it)));
  };

  // إرسال الطلب النهائي
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    // إزالة أي عناصر فارغة الاسم قبل التحقق والإرسال (حماية إضافية من خطأ 400)
    const cleanItems = items.filter((it) => it.name.trim());
    if (cleanItems.length !== items.length) setItems(cleanItems);

    if (cleanItems.length === 0) {
      setStatusMessage({ type: "error", text: "يرجى إضافة عنصر واحد على الأقل للقائمة" });
      return;
    }

    // تحقق من صحة رقم الهاتف الجزائري (يبدأ بـ 05/06/07 ويتكوّن من 10 أرقام)
    const phoneRegex = /^0[5-7][0-9]{8}$/;
    if (!phoneRegex.test(phone.trim())) {
      setStatusMessage({ type: "error", text: "يرجى إدخال رقم هاتف صحيح (10 أرقام يبدأ بـ 05 أو 06 أو 07)" });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone, location, notes, items: cleanItems }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatusMessage({ type: "success", text: "تم إرسال طلبك بنجاح! سنتواصل معك قريباً لتأكيد الشحن." });
        setItems([]);
        setFullName("");
        setPhone("");
        setLocation("");
        setNotes("");
      } else {
        throw new Error(data.error || "حدث خطأ أثناء إرسال الطلب");
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "فشل الاتصال بالسيرفر" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 text-slate-800 py-6 sm:py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* هيدر الصفحة */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-indigo-950">
            طلب التجميع والقائمة المخصصة
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm">
            حدد مستواك، صور قائمتك الورقية، أو ادخل أدواتك بنفسك وسنتكفل بتجهيزها لك.
          </p>
        </div>

        {/* رسائل التنبيه والنجاح - تظهر كإشعار ثابت فوق الصفحة بغض النظر عن مكان التمرير */}
        {statusMessage && (
          <div className={`fixed top-4 inset-x-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-md z-[100] p-4 rounded-2xl flex items-center gap-3 shadow-lg ${
            statusMessage.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}>
            {statusMessage.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" /> : <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />}
            <p className="text-xs sm:text-sm font-medium flex-1">{statusMessage.text}</p>
            <button type="button" onClick={() => setStatusMessage(null)} className="shrink-0 opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmitOrder} className="space-y-6">
          
          {/* 🎓 1. بطاقة القوائم الجاهزة */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <button
              type="button"
              onClick={() => setIsMainPremadeOpen(!isMainPremadeOpen)}
              className="w-full flex items-center justify-between text-indigo-950 hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                <span className="font-bold text-base sm:text-lg" >اختر قائمة جاهزة حسب المستوى</span>
              </div>
              {isMainPremadeOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {isMainPremadeOpen && (
              <div className="pt-2 space-y-2">
                {Object.keys(PREMADE_PHASES).map((phase) => (
                  <div key={phase} className="border border-slate-200 rounded-2xl bg-slate-50/50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenPhase(openPhase === phase ? null : phase)}
                      className="w-full flex items-center justify-between p-3 text-right font-bold text-xs sm:text-sm text-slate-800 hover:bg-slate-100/50"
                    >
                      <span>{phase}</span>
                      {openPhase === phase ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>

                    {openPhase === phase && (
                      <div className="p-3 border-t border-slate-200 bg-white space-y-3">
                        {Object.keys(PREMADE_PHASES[phase]).map((yearLabel) => (
                          <div key={yearLabel} className="space-y-1.5">
                            <span className="block text-[11px] font-bold text-slate-400">{yearLabel}</span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {PREMADE_PHASES[phase][yearLabel].map((level) => (
                                <button
                                  key={level.key}
                                  type="button"
                                  onClick={() => handleSelectYear(level.key)}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 border border-slate-200 text-indigo-950 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-center"
                                >
                                  {level.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ⚡ فاصل بصري بكلمة "أو" بين الكروت المستقلة */}
          <div className="relative flex items-center justify-center my-2">
            <div className="flex-grow border-t border-slate-300"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-xs font-bold bg-slate-100 px-3 py-1 rounded-full border border-slate-300">
              أو
            </span>
            <div className="flex-grow border-t border-slate-300"></div>
          </div>

          {/* 📷 2. بطاقة تصوير القائمة الورقية */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-indigo-950">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <span className="font-bold text-base sm:text-lg">تصوير القائمة الورقية مباشرة</span>
            </div>

            {!isCameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                disabled={isScanning}
                className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-500 rounded-2xl p-6 text-center transition-colors bg-indigo-50/30 flex flex-col items-center justify-center gap-2"
              >
                {isScanning ? (
                  <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
                ) : (
                  <Camera className="w-7 h-7 text-indigo-600" />
                )}
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {isScanning ? SCAN_MESSAGES[scanMsgIndex] : "التقاط صورة القائمة بالكاميرا فوراً"}
                </span>
              </button>
            ) : (
              <div className="fixed inset-0 z-50 bg-black flex flex-col">
                <div className="relative flex-1 overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="absolute top-4 left-4 bg-slate-900/80 text-white p-2.5 rounded-full hover:bg-slate-900"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={captureAndScan}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 flex items-center justify-center gap-2 text-sm sm:text-base shrink-0"
                >
                  <Camera className="w-5 h-5" /> قراءة الصورة الملتقتة
                </button>
              </div>
            )}
          </div>

          {/* 📝 3. بطاقة مراجعة وتعديل المنتجات */}
          <div ref={reviewSectionRef} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3 scroll-mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-950">
                <ListCheck className="w-5 h-5 text-indigo-600" />
                <span className="font-bold text-base sm:text-lg">مراجعة وتعديل قائمة المنتجات</span>
              </div>
              <button
                type="button"
                onClick={handleAddEmptyItem}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> إضافة منتج
              </button>
            </div>

            {items.length > 0 && (
              <p className="text-[11px] font-bold text-slate-400">
                عدد المنتجات: {items.length} — إجمالي القطع: {items.reduce((sum, it) => sum + it.quantity, 0)}
              </p>
            )}

            <div className="space-y-2">
              {/* عناصر القائمة */}
              {items.map((item, index) => (
                <div key={index}>
                  <div className="flex gap-2 items-center">
                    <input
                      ref={(el) => { itemInputRefs.current[index] = el; }}
                      type="text"
                      value={item.name}
                      onChange={(e) => handleItemNameChange(index, e.target.value)}
                      onKeyDown={(e) => handleItemKeyDown(e, index)}
                      onBlur={() => handleItemBlur(index)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shrink-0">
                      <button type="button" onClick={() => handleQuantityChange(index, item.quantity - 1)} className="px-2 py-1 text-slate-500 hover:bg-slate-200">-</button>
                      <span className="px-2.5 text-xs font-bold">{item.quantity}</span>
                      <button type="button" onClick={() => handleQuantityChange(index, item.quantity + 1)} className="px-2 py-1 text-slate-500 hover:bg-slate-200">+</button>
                    </div>
                    <button type="button" onClick={() => handleRequestRemoveItem(index)} className="text-rose-500 hover:text-rose-700 p-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* تأكيد حذف هذا العنصر بالذات، يظهر مباشرة تحته */}
                  {itemPendingDelete === index && (
                    <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-1.5">
                      <span className="text-[11px] font-bold text-rose-700">
                        حذف &quot;{item.name}&quot;؟
                      </span>
                      <div className="flex gap-2">
                        <button type="button" onClick={confirmRemoveItem} className="text-[11px] font-bold text-rose-700 hover:underline">
                          تأكيد الحذف
                        </button>
                        <button type="button" onClick={cancelRemoveItem} className="text-[11px] font-bold text-slate-500 hover:underline">
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* حقل الإضافة التلقائي بالـ Enter */}
              <div className="flex gap-2 items-center pt-1">
                <input
                  ref={newItemNameRef}
                  type="text"
                  placeholder="اكتب اسم المنتج واضغط Enter..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-3 py-2 border-2 border-dashed border-slate-200 focus:border-indigo-500 rounded-xl text-xs sm:text-sm focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="العدد"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))}
                  onKeyDown={handleKeyDown}
                  className="w-16 sm:w-20 px-2 py-2 border-2 border-dashed border-slate-200 focus:border-indigo-500 rounded-xl text-xs sm:text-sm text-center focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-400">💡 اكتب اسم المنتج والعدد ثم اضغط <b>Enter</b> للإضافة المباشرة للقائمة.</p>

              {items.length > 0 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleClearAllItems}
                    className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> تفريغ الكل
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 📍 4. بطاقة الملاحظات ومعلومات التواصل والشحن */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-indigo-950">
              <FileText className="w-5 h-5 text-indigo-600" />
              <span className="font-bold text-base sm:text-lg">الملاحظات ومعلومات التواصل</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات إضافية (اختياري)</label>
                <textarea
                  placeholder="تفضيلات الماركات، الدرجات، أو أي شروط خاصة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onFocus={scrollFieldIntoView}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-16"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1 whitespace-nowrap">
                    <User className="w-3.5 h-3.5" /> الاسم واللقب *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="محمد علي"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onFocus={scrollFieldIntoView}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1 whitespace-nowrap">
                    <Phone className="w-3.5 h-3.5 inline-block ml-1" /> رقم الهاتف *
                  </label>
                  <input
                    type="tel"
                    required
                    dir="rtl"
                    placeholder="06XXXXXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onFocus={scrollFieldIntoView}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1 whitespace-nowrap">
                  <MapPin className="w-3.5 h-3.5" /> عنوان ومكان التوصيل *
                </label>
                <input
                  type="text"
                  required
                  placeholder="الولاية، البلدية، والحي"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onFocus={scrollLocationAndSubmitIntoView}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* زر التأكيد والإرسال النهائي */}
            <button
              ref={submitButtonRef}
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 text-sm sm:text-base mt-4 disabled:bg-slate-300"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" /> تأكيد وإرسال الطلب
                </>
              )}
            </button>
          </div>

        </form>

        {/* نافذة السؤال عن دمج القائمة الجاهزة الجديدة أو استبدال القائمة الحالية بها */}
        {pendingPresetLevel && (
          <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 text-center shadow-xl">
              <p className="text-sm font-semibold text-slate-800">
                لديك عناصر في القائمة الحالية. ماذا تريد أن تفعل بالقائمة الجاهزة الجديدة؟
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => applyPresetItems(pendingPresetLevel, "merge")}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm"
                >
                  دمج القائمتين (جمع العناصر المشتركة)
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetItems(pendingPresetLevel, "replace")}
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm"
                >
                  استبدال القائمة الحالية بالكامل
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPresetLevel(null)}
                  className="w-full text-slate-500 hover:text-slate-700 font-semibold py-2 text-xs sm:text-sm"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}