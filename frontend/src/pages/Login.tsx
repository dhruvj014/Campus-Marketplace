import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { login, adminLoginStep2 } from "@/lib/api";
import { authStore } from "@/store/authStore";
import { UserRole } from "@/types";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<1 | 2>(1);
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [inputError, setInputError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSecurityAnswer, setShowSecurityAnswer] = useState(false);
  // Check for message from URL params (e.g., general info)
  useEffect(() => {
    const message = searchParams.get("message");
    const messageType = searchParams.get("type");
    if (!message) return;

    if (messageType !== "force_logout") {
      toast.info(message);
    }

    window.history.replaceState({}, "", "/login");
  }, [searchParams]);

  const validateInput = (input: string): boolean => {
    if (!input.trim()) {
      setInputError("Email or username is required");
      return false;
    }
    setInputError("");
    return true;
  };

  const validatePassword = (password: string): boolean => {
    if (!password.trim()) {
      setPasswordError("Password is required");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmailOrUsername(value);
    if (inputError && value) {
      validateInput(value);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (passwordError && value) {
      validatePassword(value);
    }
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate inputs
    const isInputValid = validateInput(emailOrUsername);
    const isPasswordValid = validatePassword(password);

    if (!isInputValid || !isPasswordValid) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await login({ email: emailOrUsername, password });

      // Check if admin requires security question
      if (response.requires_security && response.temp_token) {
        setTempToken(response.temp_token);
        setSecurityQuestion(response.security_question || "Best movie of all time?");
        setStep(2);
        toast.success("Credentials verified. Please answer the security question.");
      } else if (response.access_token && response.user) {
        // Regular user login
        authStore.setAuth(response.access_token, response.user);
        toast.success("Login successful!");

        // Redirect admin to dashboard, regular users to home
        if (response.user.role === UserRole.ADMIN) {
          navigate("/admin/dashboard");
        } else {
          navigate("/");
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!securityAnswer.trim()) {
      setError("Please enter the security answer");
      return;
    }

    setIsLoading(true);

    try {
      const response = await adminLoginStep2({ answer: securityAnswer }, tempToken);
      if (response.access_token && response.user) {
        authStore.setAuth(response.access_token, response.user);
        toast.success("Admin login successful!");
        // Force page reload to ensure auth state is properly recognized
        window.location.href = "/admin/dashboard";
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Security answer incorrect";
      setError(errorMessage);
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setSecurityAnswer("");
    setError("");
    setShowSecurityAnswer(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="flex-1 flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-md shadow-elegant border-border/50 animate-fade-in">
          <CardHeader className="space-y-1 text-center pb-8">
            <CardTitle className="text-3xl font-bold text-primary">
              {step === 1 ? "Welcome Back" : "Admin Login"}
            </CardTitle>
            <CardDescription className="text-base">
              {step === 1 
                ? "Sign in to buy and sell with fellow Spartans" 
                : "Welcome Admin! Please answer the security question to continue"}
            </CardDescription>
          </CardHeader>
          <form onSubmit={step === 1 ? handleStep1 : handleStep2}>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
              
              {step === 1 ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="emailOrUsername">Email or Username</Label>
                    <Input
                      id="emailOrUsername"
                      type="text"
                      placeholder="yourname@sjsu.edu or username"
                      value={emailOrUsername}
                      onChange={handleInputChange}
                      onBlur={() => validateInput(emailOrUsername)}
                      className={inputError ? "border-destructive" : ""}
                      required
                      autoFocus
                    />
                    {inputError && (
                      <p className="text-sm text-destructive mt-1">{inputError}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={handlePasswordChange}
                        onBlur={() => validatePassword(password)}
                        className={passwordError ? "border-destructive pr-10" : "pr-10"}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {passwordError && (
                      <p className="text-sm text-destructive mt-1">{passwordError}</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="security-question" className="text-sm font-medium">
                      Security Question
                    </Label>
                    <div className="p-3 bg-muted/50 rounded-md text-sm">
                      {securityQuestion}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="security-answer">Answer</Label>
                    <div className="relative">
                      <Input
                        id="security-answer"
                        type={showSecurityAnswer ? "text" : "password"}
                        placeholder="Enter your answer"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        className="pr-10"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecurityAnswer(!showSecurityAnswer)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showSecurityAnswer ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <div className="flex gap-2 w-full">
                {step === 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    Back
                  </Button>
                )}
                <Button type="submit" className={step === 2 ? "flex-1" : "w-full"} disabled={isLoading}>
                  {isLoading
                    ? step === 1
                      ? "Signing in..."
                      : "Verifying..."
                    : step === 1
                      ? "Sign In"
                      : "Login"}
                </Button>
              </div>
              {step === 1 && (
                <>
                  <p className="text-sm text-center text-muted-foreground">
                    Don't have an account?{" "}
                    <Link to="/signup" className="text-primary hover:underline font-medium">
                      Sign up
                    </Link>
                  </p>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/")}
                    className="w-full"
                  >
                    Browse Marketplace Without Logging In
                  </Button>
                </>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
