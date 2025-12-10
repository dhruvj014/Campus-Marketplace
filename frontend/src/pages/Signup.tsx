import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { signup, login, sendVerificationCode, verifyCode } from "@/lib/api";
import { authStore } from "@/store/authStore";
import { UserRole } from "@/types";

type SignupStep = "form" | "verify";

export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<SignupStep>("form");
  const [formData, setFormData] = useState({
    email: "",
    username: "",
    password: "",
    full_name: "",
    phone: "",
    student_id: "",
  });
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [error, setError] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSendCode = async () => {
    if (!formData.email.trim()) {
      setError("Please enter your email first");
      return;
    }

    setIsSendingCode(true);
    setError("");

    try {
      await sendVerificationCode({ email: formData.email });
      toast.success("Verification code sent to your email!");
      setStep("verify");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send verification code";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setIsVerifyingCode(true);
    setError("");

    try {
      await verifyCode({ email: formData.email, code: otpCode });
      setEmailVerified(true);
      toast.success("Email verified successfully!");
      // Go back to form to complete signup
      setStep("form");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Invalid verification code";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!emailVerified) {
      setError("Please verify your email first");
      toast.error("Please verify your email before signing up");
      return;
    }

    setIsLoading(true);

    try {
      await signup({
        ...formData,
        role: UserRole.USER,
      });

      // Auto-login after signup
      const loginResponse = await login({
        email: formData.email,
        password: formData.password,
      });
      authStore.setAuth(loginResponse.access_token, loginResponse.user);
      toast.success("Account created successfully!");
      navigate("/");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Signup failed";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Verification Step
  if (step === "verify") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="flex items-center justify-center p-4 py-12">
          <Card className="w-full max-w-md shadow-elegant border-border/50 animate-fade-in">
            <CardHeader className="space-y-1 text-center pb-8">
              <CardTitle className="text-3xl font-bold text-primary">Verify Your Email</CardTitle>
              <CardDescription className="text-base">
                We sent a verification code to {formData.email}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="otp">Verification Code</Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtpCode(value);
                  }}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest font-mono"
                  required
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter the 6-digit code sent to your email
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button
                type="button"
                className="w-full"
                onClick={handleVerifyCode}
                disabled={isVerifyingCode || otpCode.length !== 6}
              >
                {isVerifyingCode ? "Verifying..." : "Verify Code"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStep("form");
                  setOtpCode("");
                  setError("");
                }}
              >
                Back to Signup
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleSendCode}
                disabled={isSendingCode}
              >
                {isSendingCode ? "Sending..." : "Resend Code"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  // Signup Form Step
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-md shadow-elegant border-border/50 animate-fade-in">
          <CardHeader className="space-y-1 text-center pb-8">
            <CardTitle className="text-3xl font-bold text-primary">Join the Marketplace</CardTitle>
            <CardDescription className="text-base">Create your account to start trading</CardDescription>
          </CardHeader>
          <form onSubmit={handleSignup}>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
              {emailVerified && (
                <div className="bg-green-500/10 text-green-700 dark:text-green-400 text-sm p-3 rounded-md">
                  ✓ Email verified successfully
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="yourname@sjsu.edu"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    disabled={emailVerified}
                    className={emailVerified ? "bg-muted" : ""}
                  />
                  {!emailVerified && (
                    <Button
                      type="button"
                      onClick={handleSendCode}
                      disabled={isSendingCode || !formData.email.trim()}
                      variant="outline"
                    >
                      {isSendingCode ? "Sending..." : "Send Code"}
                    </Button>
                  )}
                </div>
                {!emailVerified && (
                  <p className="text-xs text-muted-foreground">
                    You need to verify your email before signing up
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  type="text"
                  placeholder="Full Name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student_id">Student ID</Label>
                <Input
                  id="student_id"
                  name="student_id"
                  type="text"
                  placeholder="Student ID"
                  value={formData.student_id}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoading || !emailVerified}>
                {isLoading ? "Creating account..." : "Create Account"}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
