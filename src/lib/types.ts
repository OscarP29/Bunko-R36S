export type Game = {
  id: string;
  fileName: string;
  title: string;
  imageName: string | null;
  imagePath: string | null;
  hasImage: boolean;
};

export type System = {
  id: string;
  name: string;
  path: string;
  gameCount: number;
  missingImages: number;
};

export type Note = {
  id: string;
  text: string;
  done: boolean;
  title?: string;
  category?: string;
  system?: string;
  folder?: string;
  priority?: "alta" | "media" | "baja";
  reason?: string;
  notes?: string;
  suggestedFileName?: string;
};
export type Tab = "library" | "notes";
export type Filter = "all" | "missing";
export type SortBy = "name" | "file";
export type ViewMode = "grid" | "list";
export type ImageStatus = "idle" | "searching" | "found" | "missing";

export type NewGameDraft = {
  id: string;
  romPath: string;
  fileName: string;
  title: string;
  imageBytes: number[] | null;
  imagePreview: string;
  imageStatus: ImageStatus;
  searching: boolean;
  error: string;
};

export type AiCategoryItem = {
  title?: string;
  system?: string;
  fileName?: string;
  folder?: string;
  suggestedFileName?: string;
  reason?: string;
  priority?: string;
  notes?: string;
};

export type AiProfile = {
  summary?: string;
  topGenres?: string[];
  favoriteSagas?: string[];
  gaps?: string[];
};

export type AiOrganizerJson = {
  version?: number;
  generatedAt?: string;
  profile?: AiProfile;
  categories: AiCategory[];
  uncategorized?: AiCategoryItem[];
};

export type AiCategory = {
  name: string;
  description?: string;
  items: AiCategoryItem[];
};



export type FullEntry = Game & {
  systemName: string;
  systemPath: string;
  systemFolder: string;
};

export type ArtworkEntry = { path: string; name: string };
export type ArtworkMatch = ArtworkEntry & { score: number };
export type ArtworkIndex = { savedAt: number; files: ArtworkEntry[] };
