import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTheme, setTheme } from "@/lib/utils";

export default function ThemeToggle() {
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const theme = getTheme();
    setCurrentTheme(theme);
    setTheme(theme);
  }, []);

  const toggleTheme = () => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setCurrentTheme(newTheme);
    setTheme(newTheme);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="flex items-center space-x-2"
      aria-label="Toggle theme"
    >
      {currentTheme === 'light' ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">
        {currentTheme === 'light' ? 'Dark' : 'Light'}
      </span>
    </Button>
  );
}


