import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  KeyRound, 
  Mail, 
  Phone, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Lock, 
  Eye, 
  EyeOff, 
  Loader2, 
  RotateCcw, 
  Sparkles, 
  AlertCircle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Step = "METHOD" | "IDENTIFIER" | "OTP" | "RESET" | "SUCCESS";

export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("METHOD");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  
  // OTP 6-box input state
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Cooldown & Resend
  const [cooldown, setCooldown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // New Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState("");

  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [devPreviewCode, setDevPreviewCode] = useState<string | null>(null);

  // Resend Countdown Timer
  useEffect(() => {
    let timer: any;
    if (step === "OTP" && cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, cooldown]);

  // Request OTP API Call
  const handleRequestOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setGeneralError(null);
    setOtpError(null);

    try {
      const res = await apiFetch<{ message: string; cooldown_seconds: number; dev_preview_code?: string }>(
        "/auth/forgot-password/request-otp",
        {
          method: "POST",
          body: JSON.stringify({ method, identifier }),
        }
      );

      if (res.dev_preview_code) {
        setDevPreviewCode(res.dev_preview_code);
      }

      setCooldown(60);
      setCanResend(false);
      setOtp(["", "", "", "", "", ""]);
      setStep("OTP");
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      setGeneralError(err.message || "Failed to dispatch verification code.");
    } finally {
      setLoading(false);
    }
  };

  // OTP Input Key Handling
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when 6th digit entered
    if (newOtp.every((digit) => digit !== "")) {
      verifyOTP(newOtp.join(""));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();
    if (/^\d{6}$/.test(pasted)) {
      const digits = pasted.split("");
      setOtp(digits);
      verifyOTP(pasted);
    }
  };

  // Verify OTP API Call
  const verifyOTP = async (codeToVerify?: string) => {
    const fullCode = codeToVerify || otp.join("");
    if (fullCode.length !== 6) {
      setOtpError("Please enter all 6 digits.");
      return;
    }

    setLoading(true);
    setOtpError(null);

    try {
      const res = await apiFetch<{ message: string; reset_token: string }>(
        "/auth/forgot-password/verify-otp",
        {
          method: "POST",
          body: JSON.stringify({ method, identifier, otp: fullCode }),
        }
      );

      setResetToken(res.reset_token);
      setStep("RESET");
    } catch (err: any) {
      setOtpError(err.message || "Invalid or expired verification code.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  // Reset Password API Call
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setGeneralError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setGeneralError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setGeneralError(null);

    try {
      await apiFetch("/auth/forgot-password/reset", {
        method: "POST",
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
      });
      setStep("SUCCESS");
    } catch (err: any) {
      setGeneralError(err.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Password Strength Calculator
  const getPasswordStrength = () => {
    if (!newPassword) return { score: 0, label: "", color: "" };
    let score = 0;
    if (newPassword.length >= 6) score += 1;
    if (newPassword.length >= 8) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;

    if (score === 1) return { score: 25, label: "Weak", color: "bg-red-500 text-red-400" };
    if (score === 2) return { score: 50, label: "Fair", color: "bg-amber-500 text-amber-400" };
    if (score === 3) return { score: 75, label: "Good", color: "bg-emerald-400 text-emerald-400" };
    return { score: 100, label: "Strong", color: "bg-emerald-500 text-emerald-500" };
  };

  const strength = getPasswordStrength();

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/80 shadow-2xl overflow-hidden bg-card/95 backdrop-blur">
        <AnimatePresence mode="wait">
          {/* STEP 1: SELECT RECOVERY METHOD */}
          {step === "METHOD" && (
            <motion.div
              key="step-method"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-2">
                  <KeyRound className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold">Recover your account</CardTitle>
                <CardDescription>
                  Choose how you want to receive your verification code
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMethod("email");
                      setStep("IDENTIFIER");
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 border-border hover:border-primary/80 bg-secondary/40 hover:bg-primary/5 transition-all group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-card border border-border group-hover:border-primary/40 text-primary transition-colors">
                      <Mail className="h-6 w-6" />
                    </div>
                    <div className="text-center">
                      <span className="font-bold text-sm block text-foreground">Email</span>
                      <span className="text-[11px] text-muted-foreground">Receive code via Inbox</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMethod("phone");
                      setStep("IDENTIFIER");
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 border-border hover:border-primary/80 bg-secondary/40 hover:bg-primary/5 transition-all group cursor-pointer"
                  >
                    <div className="p-3 rounded-xl bg-card border border-border group-hover:border-primary/40 text-primary transition-colors">
                      <Phone className="h-6 w-6" />
                    </div>
                    <div className="text-center">
                      <span className="font-bold text-sm block text-foreground">Mobile Number</span>
                      <span className="text-[11px] text-muted-foreground">Receive code via SMS</span>
                    </div>
                  </button>
                </div>

                <div className="pt-2 text-center">
                  <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to Sign In</span>
                  </Link>
                </div>
              </CardContent>
            </motion.div>
          )}

          {/* STEP 2: ENTER EMAIL OR PHONE */}
          {step === "IDENTIFIER" && (
            <motion.div
              key="step-identifier"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              <CardHeader className="text-center pb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("METHOD")}
                  className="w-fit mb-2 gap-1.5 text-xs text-muted-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Change Method</span>
                </Button>
                <CardTitle className="text-2xl font-bold">
                  {method === "email" ? "Enter your email" : "Enter mobile number"}
                </CardTitle>
                <CardDescription>
                  {method === "email"
                    ? "Enter your registered email address to receive your 6-digit code."
                    : "Enter your registered mobile phone number to receive your code."}
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleRequestOTP} className="space-y-4">
                  {generalError && (
                    <div className="p-3 text-xs rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{generalError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">
                      {method === "email" ? "Registered Email" : "Registered Mobile Number"}
                    </label>
                    <input
                      type={method === "email" ? "email" : "tel"}
                      required
                      placeholder={method === "email" ? "name@organization.org" : "+91 98765 43210"}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                    />
                  </div>

                  <Button type="submit" disabled={loading} size="lg" className="w-full gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span>Send Verification Code</span>
                  </Button>
                </form>
              </CardContent>
            </motion.div>
          )}

          {/* STEP 3 & 4: OTP INPUT & VERIFICATION */}
          {step === "OTP" && (
            <motion.div
              key="step-otp"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.25 }}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <CardTitle className="text-2xl font-bold">OTP sent successfully</CardTitle>
                <CardDescription>
                  Enter the 6-digit code dispatched to{" "}
                  <span className="font-semibold text-foreground">{identifier}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Local Testing Banner (Convenient Dev Assist) */}
                {devPreviewCode && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center font-mono">
                    Demo Code for testing: <strong>{devPreviewCode}</strong>
                  </div>
                )}

                {/* 6 Square Animated OTP Inputs with Error Shake */}
                <motion.div
                  animate={shake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
                  transition={{ duration: 0.4 }}
                  className="flex justify-center gap-2 sm:gap-3"
                  onPaste={handleOtpPaste}
                >
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (inputRefs.current[idx] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-extrabold rounded-xl border bg-card text-foreground transition-all focus:outline-none focus:ring-2 ${
                        otpError
                          ? "border-destructive focus:ring-destructive"
                          : "border-border focus:border-primary focus:ring-primary shadow-sm"
                      }`}
                    />
                  ))}
                </motion.div>

                {otpError && (
                  <p className="text-xs text-center text-destructive font-medium">{otpError}</p>
                )}

                <Button
                  onClick={() => verifyOTP()}
                  disabled={loading || otp.some((d) => d === "")}
                  size="lg"
                  className="w-full gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  <span>Verify Code</span>
                </Button>

                {/* Cooldown Timer & Resend Controls */}
                <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground pt-1">
                  {canResend ? (
                    <button
                      type="button"
                      onClick={() => handleRequestOTP()}
                      className="text-primary hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Resend OTP</span>
                    </button>
                  ) : (
                    <span>
                      Resend code in <strong className="text-primary font-mono">{cooldown}s</strong>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setStep("IDENTIFIER")}
                    className="hover:text-foreground underline pt-1 cursor-pointer"
                  >
                    Change {method === "email" ? "email" : "mobile number"}
                  </button>
                </div>
              </CardContent>
            </motion.div>
          )}

          {/* STEP 5: CREATE NEW PASSWORD */}
          {step === "RESET" && (
            <motion.div
              key="step-reset"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <CardHeader className="text-center pb-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-2">
                  <Lock className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold">Create New Password</CardTitle>
                <CardDescription>
                  Choose a secure password for your ResQMeal account
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {generalError && (
                    <div className="p-3 text-xs rounded-xl bg-destructive/15 border border-destructive/30 text-destructive">
                      {generalError}
                    </div>
                  )}

                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full h-11 px-3.5 pr-10 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {newPassword && (
                      <div className="space-y-1 pt-1">
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${strength.color}`}
                            style={{ width: `${strength.score}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                          <span>Password Strength</span>
                          <span className={strength.color.split(" ")[1]}>{strength.label}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Confirm Password</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary shadow-inner"
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-[11px] text-destructive">Passwords do not match.</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || !newPassword || newPassword !== confirmPassword}
                    size="lg"
                    className="w-full gap-2 mt-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>Update Password</span>
                  </Button>
                </form>
              </CardContent>
            </motion.div>
          )}

          {/* STEP 6: SUCCESS ANIMATION */}
          {step === "SUCCESS" && (
            <motion.div
              key="step-success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="py-6 text-center"
            >
              <CardContent className="space-y-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 border-2 border-emerald-500 text-emerald-400 shadow-xl"
                >
                  <CheckCircle2 className="h-10 w-10" />
                </motion.div>

                <div>
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
                    Password Reset Successfully!
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                    Your password has been securely updated. You can now access your ResQMeal account.
                  </p>
                </div>

                <Button
                  size="lg"
                  onClick={() => navigate("/login")}
                  className="w-full gap-2 font-bold shadow-lg"
                >
                  <span>Continue to Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}