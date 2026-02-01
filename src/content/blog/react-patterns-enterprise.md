---
title: "React Patterns That Scale: Lessons from Enterprise Development"
description: "Practical React patterns and architecture decisions for building maintainable enterprise applications."
date: 2024-12-01
tags: ["react", "javascript", "frontend", "architecture"]
---

After years of building React applications for enterprise environments, I've learned that the patterns you choose early on can make or break your codebase as it grows. Here are the patterns that have served our team well.

## Project Structure That Scales

Forget the classic `components/`, `hooks/`, `utils/` structure. For large applications, feature-based organization works better:

```
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   ├── types.ts
│   │   └── index.ts
│   ├── dashboard/
│   ├── reports/
│   └── settings/
├── shared/
│   ├── components/
│   ├── hooks/
│   └── utils/
├── api/
│   └── client.ts
└── App.tsx
```

Each feature is self-contained, making it easy to:
- Find related code quickly
- Understand feature boundaries
- Potentially extract features into separate packages

## Custom Hooks for Business Logic

Move business logic out of components and into custom hooks:

```typescript
// ❌ Logic mixed with UI
function OrderList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOrders()
      .then(setOrders)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const filteredOrders = orders.filter(o => o.status === 'active');
  // ... more logic

  return <div>{/* UI */}</div>;
}

// ✅ Logic extracted to hook
function useOrders(filter?: OrderFilter) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchOrders(filter)
      .then(setOrders)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [filter]);

  const activeOrders = useMemo(
    () => orders.filter(o => o.status === 'active'),
    [orders]
  );

  return { orders, activeOrders, loading, error, refetch: () => fetchOrders(filter) };
}

function OrderList() {
  const { activeOrders, loading, error } = useOrders();

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return <OrderTable orders={activeOrders} />;
}
```

## Compound Components Pattern

For complex, flexible components, use the compound pattern:

```typescript
// Usage
<DataTable data={users}>
  <DataTable.Header>
    <DataTable.Column field="name" sortable>Name</DataTable.Column>
    <DataTable.Column field="email">Email</DataTable.Column>
    <DataTable.Column field="role" filterable>Role</DataTable.Column>
  </DataTable.Header>
  <DataTable.Body>
    {(row) => (
      <DataTable.Row key={row.id}>
        <DataTable.Cell>{row.name}</DataTable.Cell>
        <DataTable.Cell>{row.email}</DataTable.Cell>
        <DataTable.Cell>
          <RoleBadge role={row.role} />
        </DataTable.Cell>
      </DataTable.Row>
    )}
  </DataTable.Body>
  <DataTable.Pagination pageSize={10} />
</DataTable>

// Implementation
const DataTableContext = createContext<DataTableContextValue | null>(null);

function DataTable({ children, data }: DataTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);

  const processedData = useMemo(() => {
    let result = [...data];
    // Apply filters
    // Apply sorting
    return result;
  }, [data, sortConfig, filters]);

  return (
    <DataTableContext.Provider value={{
      data: processedData,
      sortConfig,
      setSortConfig,
      filters,
      setFilters,
      page,
      setPage
    }}>
      <table className="data-table">{children}</table>
    </DataTableContext.Provider>
  );
}

DataTable.Header = DataTableHeader;
DataTable.Column = DataTableColumn;
DataTable.Body = DataTableBody;
DataTable.Row = DataTableRow;
DataTable.Cell = DataTableCell;
DataTable.Pagination = DataTablePagination;
```

## API Layer Abstraction

Never call `fetch` directly from components. Create an API layer:

```typescript
// api/client.ts
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = tokenService.getAccessToken();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }

  get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint);
  }

  post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ... put, delete, etc.
}

export const api = new ApiClient(import.meta.env.VITE_API_URL);

// features/orders/api/orders.ts
export const ordersApi = {
  getAll: (params?: OrderParams) =>
    api.get<Order[]>(`/orders?${new URLSearchParams(params)}`),

  getById: (id: string) =>
    api.get<Order>(`/orders/${id}`),

  create: (data: CreateOrderDto) =>
    api.post<Order>('/orders', data),

  update: (id: string, data: UpdateOrderDto) =>
    api.put<Order>(`/orders/${id}`, data),
};
```

## Error Boundaries with Recovery

Implement error boundaries that allow users to recover:

```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to error tracking service
    errorTracker.capture(error, { componentStack: info.componentStack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

// Wrap features, not the entire app
function App() {
  return (
    <Layout>
      <ErrorBoundary>
        <Dashboard />
      </ErrorBoundary>
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
    </Layout>
  );
}
```

## State Management Strategy

Not everything needs global state. Here's our decision tree:

```
Is this state used by multiple unrelated components?
├── No → Local state (useState)
└── Yes → Is it server data?
    ├── Yes → React Query / SWR
    └── No → Is it complex with many actions?
        ├── Yes → Zustand / Redux
        └── No → Context API
```

For server state, React Query is excellent:

```typescript
function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: ordersApi.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
```

## TypeScript Patterns

Strong typing catches bugs early:

```typescript
// Discriminated unions for state
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// Exhaustive switch
function renderState<T>(state: AsyncState<T>) {
  switch (state.status) {
    case 'idle':
      return null;
    case 'loading':
      return <Spinner />;
    case 'success':
      return <Data data={state.data} />;
    case 'error':
      return <Error error={state.error} />;
    default:
      // TypeScript ensures this is never reached
      const _exhaustive: never = state;
      return _exhaustive;
  }
}
```

## Conclusion

These patterns have helped us maintain a large React codebase with multiple developers. The key principles:

1. **Organize by feature**, not by type
2. **Extract logic into hooks**, keep components focused on UI
3. **Abstract external dependencies** (API, storage, etc.)
4. **Type everything** with TypeScript
5. **Choose the right state management** for each use case

Remember: patterns are guidelines, not rules. Adapt them to your team's needs and project requirements.
