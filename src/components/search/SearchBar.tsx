import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Clock, TrendingUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchService } from "@/services/searchService";

const SearchBar = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ suggestion: string; type: string }[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setHistory(searchService.getSearchHistory());
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const results = await searchService.getSearchSuggestions(q);
    setSuggestions(results);
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const executeSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    searchService.saveSearchQuery(searchQuery.trim());
    setHistory(searchService.getSearchHistory());
    setIsOpen(false);
    setQuery("");
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const allItems = [
    ...suggestions.map(s => ({ label: s.suggestion, type: "suggestion" as const })),
    ...(query.length < 2 ? history.map(h => ({ label: h, type: "history" as const })) : []),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < allItems.length) {
        executeSearch(allItems[activeIndex].label);
      } else {
        executeSearch(query);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen && (allItems.length > 0 || query.length < 2);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-2xl mx-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products, brands, categories..."
          className="pl-10 pr-8 h-10 bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setSuggestions([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="p-2">
              <p className="text-xs font-medium text-muted-foreground px-2 pb-1">Suggestions</p>
              {suggestions.map((s, i) => (
                <button
                  key={`s-${i}`}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left ${
                    activeIndex === i ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                  }`}
                  onClick={() => executeSearch(s.suggestion)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{s.suggestion}</span>
                </button>
              ))}
            </div>
          )}

          {/* Recent searches */}
          {query.length < 2 && history.length > 0 && (
            <div className="p-2 border-t first:border-t-0">
              <div className="flex items-center justify-between px-2 pb-1">
                <p className="text-xs font-medium text-muted-foreground">Recent Searches</p>
                <button
                  onClick={() => { searchService.clearSearchHistory(); setHistory([]); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              {history.map((h, i) => {
                const idx = suggestions.length + i;
                return (
                  <button
                    key={`h-${i}`}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left ${
                      activeIndex === idx ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                    onClick={() => executeSearch(h)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{h}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
