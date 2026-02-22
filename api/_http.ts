export type ApiHandlerRequest<TBody = unknown> = {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, string | string[] | undefined>;
    body?: TBody;
};

export type ApiHandlerResponse = {
    status: (statusCode: number) => ApiHandlerResponse;
    json: (payload: unknown) => ApiHandlerResponse;
    setHeader: (name: string, value: string[]) => void;
    end: (payload?: string) => ApiHandlerResponse;
};
