import json
import os
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler

import psycopg
import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    parse_expr,
    standard_transformations,
)


TRANSFORMATIONS = standard_transformations + (convert_xor,)
ALLOWED_TOOL_NAMES = {
    "deterministic_evaluate",
    "symbolic_simplify",
    "symbolic_solve",
    "symbolic_integrate",
    "symbolic_differentiate",
}
ALLOWED_NAMES = {
    "pi": sp.pi,
    "E": sp.E,
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "log": sp.log,
    "ln": sp.log,
    "sqrt": sp.sqrt,
    "exp": sp.exp,
    "Abs": sp.Abs,
}

for letter in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ":
    ALLOWED_NAMES[letter] = sp.Symbol(letter)


def _json_response(handler: BaseHTTPRequestHandler, status_code: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict | None:
    raw_length = handler.headers.get("content-length", "0")
    try:
        content_length = int(raw_length)
    except (TypeError, ValueError):
        return None

    raw_body = handler.rfile.read(content_length) if content_length > 0 else b"{}"
    try:
        parsed = json.loads(raw_body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    return parsed if isinstance(parsed, dict) else None


def _get_session_token(handler: BaseHTTPRequestHandler) -> str | None:
    cookie_header = handler.headers.get("cookie", "")
    if not cookie_header:
        return None

    cookies = SimpleCookie()
    cookies.load(cookie_header)
    morsel = cookies.get("auth_session")
    if morsel is None:
        return None
    token = morsel.value.strip()
    return token or None


def _get_authenticated_user_id(handler: BaseHTTPRequestHandler) -> int | None:
    database_url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    session_token = _get_session_token(handler)
    if not database_url or not session_token:
        return None

    try:
        with psycopg.connect(database_url, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE users
                    SET last_accessed_at = NOW()
                    FROM sessions
                    WHERE users.id = sessions.user_id
                      AND sessions.token = %s
                      AND sessions.expires_at > NOW()
                    RETURNING users.id
                    """,
                    (session_token,),
                )
                row = cursor.fetchone()
                if not row:
                    return None
                return int(row[0])
    except Exception:
        return None


def _parse_expression(expr_text: str) -> sp.Expr:
    return parse_expr(
        expr_text,
        local_dict=ALLOWED_NAMES,
        transformations=TRANSFORMATIONS,
        evaluate=False,
    )


def _resolve_symbol(variable_name: str | None, expression: sp.Expr) -> sp.Symbol:
    if variable_name and variable_name.strip():
        return sp.Symbol(variable_name.strip())

    free_symbols = sorted(expression.free_symbols, key=lambda symbol: symbol.name)
    if len(free_symbols) == 1:
        return free_symbols[0]
    raise ValueError("変数を一意に特定できませんでした。")


def _tool_result(name: str, output_text: str, exact_value: str | None = None, latex: str | None = None) -> dict:
    return {
        "success": True,
        "result": {
            "name": name,
            "success": True,
            "outputText": output_text,
            "exactValue": exact_value,
            "latex": latex,
        },
    }


def _handle_evaluate(expr_text: str) -> dict:
    expression = _parse_expression(expr_text)
    simplified = sp.simplify(expression)
    exact_value = str(simplified)
    numeric_value = sp.N(simplified)
    output_text = str(numeric_value) if len(simplified.free_symbols) == 0 else exact_value
    return _tool_result("deterministic_evaluate", output_text, exact_value, sp.latex(simplified))


def _handle_simplify(expr_text: str) -> dict:
    expression = _parse_expression(expr_text)
    simplified = sp.simplify(expression)
    exact_value = str(simplified)
    return _tool_result("symbolic_simplify", exact_value, exact_value, sp.latex(simplified))


def _handle_solve(expr_text: str, variable_name: str | None) -> dict:
    target = expr_text.strip()
    if "=" in target:
        left, right = target.split("=", 1)
        expression = sp.Eq(_parse_expression(left), _parse_expression(right))
        variable = _resolve_symbol(variable_name, expression.lhs - expression.rhs)
    else:
        expression = _parse_expression(target)
        variable = _resolve_symbol(variable_name, expression)

    solutions = sp.solve(expression, variable)
    exact_value = str(solutions)
    return _tool_result("symbolic_solve", exact_value, exact_value, None)


def _handle_integrate(payload: dict) -> dict:
    expr_text = str(payload.get("expr", "")).strip()
    if not expr_text:
        raise ValueError("expr が必要です。")

    expression = _parse_expression(expr_text)
    variable = _resolve_symbol(
        str(payload.get("variable")).strip() if payload.get("variable") is not None else None,
        expression,
    )
    lower = payload.get("lower")
    upper = payload.get("upper")

    if lower is not None and upper is not None and str(lower).strip() and str(upper).strip():
        result = sp.integrate(
            expression,
            (variable, _parse_expression(str(lower)), _parse_expression(str(upper))),
        )
    else:
        result = sp.integrate(expression, variable)

    exact_value = str(result)
    return _tool_result("symbolic_integrate", exact_value, exact_value, sp.latex(result))


def _handle_differentiate(payload: dict) -> dict:
    expr_text = str(payload.get("expr", "")).strip()
    if not expr_text:
        raise ValueError("expr が必要です。")

    expression = _parse_expression(expr_text)
    variable = _resolve_symbol(
        str(payload.get("variable")).strip() if payload.get("variable") is not None else None,
        expression,
    )
    result = sp.diff(expression, variable)
    exact_value = str(result)
    return _tool_result("symbolic_differentiate", exact_value, exact_value, sp.latex(result))


def _dispatch_tool(name: str, arguments: dict) -> dict:
    if name == "deterministic_evaluate":
        expr_text = str(arguments.get("expr", "")).strip()
        if not expr_text:
            raise ValueError("expr が必要です。")
        return _handle_evaluate(expr_text)

    if name == "symbolic_simplify":
        expr_text = str(arguments.get("expr", "")).strip()
        if not expr_text:
            raise ValueError("expr が必要です。")
        return _handle_simplify(expr_text)

    if name == "symbolic_solve":
        expr_text = str(arguments.get("expr", "")).strip()
        if not expr_text:
            raise ValueError("expr が必要です。")
        variable_name = str(arguments.get("variable")).strip() if arguments.get("variable") is not None else None
        return _handle_solve(expr_text, variable_name)

    if name == "symbolic_integrate":
        return _handle_integrate(arguments)

    if name == "symbolic_differentiate":
        return _handle_differentiate(arguments)

    raise ValueError("未対応の function name です。")


def _normalize_tool_request(body: dict) -> tuple[str, dict] | None:
    name = body.get("name")
    arguments = body.get("arguments")

    if isinstance(name, str) and isinstance(arguments, dict):
        return name, arguments

    capability = body.get("capability")
    op = body.get("op")
    payload = body.get("payload")

    if not isinstance(payload, dict) or not isinstance(capability, str) or not isinstance(op, str):
        return None

    mapping = {
        ("deterministic_calc", "evaluate"): "deterministic_evaluate",
        ("symbolic_math", "simplify"): "symbolic_simplify",
        ("symbolic_math", "solve"): "symbolic_solve",
        ("symbolic_math", "integrate"): "symbolic_integrate",
        ("symbolic_math", "differentiate"): "symbolic_differentiate",
    }

    tool_name = mapping.get((capability, op))
    if tool_name is None:
        return None

    return tool_name, payload


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if _get_authenticated_user_id(self) is None:
            _json_response(self, 401, {"error": "ログインが必要です", "code": "UNAUTHORIZED"})
            return

        body = _read_json_body(self)
        if body is None:
            _json_response(self, 400, {"error": "不正な JSON です", "code": "INVALID_JSON"})
            return

        normalized = _normalize_tool_request(body)
        if normalized is None:
            _json_response(self, 400, {"error": "未対応の function name です", "code": "INVALID_TOOL_NAME"})
            return

        tool_name, arguments = normalized

        if tool_name not in ALLOWED_TOOL_NAMES:
            _json_response(self, 400, {"error": "未対応の function name です", "code": "INVALID_TOOL_NAME"})
            return

        if not isinstance(arguments, dict):
            _json_response(self, 400, {"error": "arguments は object で指定してください", "code": "INVALID_ARGUMENTS"})
            return

        try:
            result = _dispatch_tool(tool_name, arguments)
            _json_response(self, 200, result)
        except ValueError as error:
            _json_response(self, 400, {"error": str(error), "code": "INVALID_PAYLOAD"})
        except Exception:
            _json_response(self, 500, {"error": "計算ツールの実行に失敗しました", "code": "TOOL_EXECUTION_FAILED"})

    def do_GET(self) -> None:
        _json_response(self, 405, {"error": "Method not allowed"})
