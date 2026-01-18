import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface SearchContextType {
  searchResults: any[];
  lastSearchQuery: string;
  selectedEmail: any | null;
  setSearchResults: (results: any[], query: string) => void;
  clearSearchResults: () => void;
  setSelectedEmail: (email: any | null) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};

interface SearchProviderProps {
  children: ReactNode;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  const [searchResults, setSearchResultsState] = useState<any[]>([]);
  const [lastSearchQuery, setLastSearchQuery] = useState<string>('');
  const [selectedEmail, setSelectedEmailState] = useState<any | null>(null);

  const setSearchResults = (results: any[], query: string) => {
    setSearchResultsState(results);
    setLastSearchQuery(query);
  };

  const clearSearchResults = () => {
    setSearchResultsState([]);
    setLastSearchQuery('');
  };

  const setSelectedEmail = (email: any | null) => {
    setSelectedEmailState(email);
  };

  return (
    <SearchContext.Provider
      value={{
        searchResults,
        lastSearchQuery,
        selectedEmail,
        setSearchResults,
        clearSearchResults,
        setSelectedEmail,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};
