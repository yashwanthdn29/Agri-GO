export type ProduceSuggestion = {
  name: string;
  category: string;
};

const suggestions: ProduceSuggestion[] = [
  { name: "Rice", category: "Grains & cereals" },
  { name: "Wheat", category: "Grains & cereals" },
  { name: "Maize", category: "Grains & cereals" },
  { name: "Tomato", category: "Vegetables" },
  { name: "Onion", category: "Vegetables" },
  { name: "Potato", category: "Vegetables" },
  { name: "Mango", category: "Fruits" },
  { name: "Cotton", category: "Cash crops" },
];

function ProduceSuggestions({
  onSelect,
}: {
  onSelect: (suggestion: ProduceSuggestion) => void;
}) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-semibold text-gray-600">
        Popular produce suggestions
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.name}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:border-green-400 hover:bg-green-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
          >
            {suggestion.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ProduceSuggestions;
