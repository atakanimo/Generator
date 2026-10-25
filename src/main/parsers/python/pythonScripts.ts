/**
 * Python helper scripts run with the host's interpreter (plan backend-python-fastapi PY7). Kept as strings so the
 * packaged app needs no extra files; both run with `-I` (isolated: no user site, no cwd on `sys.path`).
 *
 * - `EXTRACT_SCRIPT`: static read of a Pydantic module with `ast` (the module is never imported or executed) → JSON:
 *   classes (bases, `model_config`, annotated fields, `Field(...)` arguments, enum members, validators), module-level
 *   aliases / configs and `from … import …` names. All typing semantics live in TS (`pydanticModel.ts`).
 * - `MONGO_REPORT_SCRIPT`: read-only sample of a collection with PyMongo (`estimated_document_count`, `find` /
 *   `$sample`); compares the documents' keys and value types with the model shape on stdin. Never writes.
 */

export const EXTRACT_SCRIPT = String.raw`
import ast, json, sys

def src(n):
    return ast.unparse(n)

def lit(n):
    if isinstance(n, ast.Constant) and n.value is Ellipsis:
        return {"ellipsis": True}
    try:
        v = ast.literal_eval(n)
        json.dumps(v)
        return {"v": v}
    except Exception:
        return {"expr": src(n)}

def flat_union(n, out):
    if isinstance(n, ast.BinOp) and isinstance(n.op, ast.BitOr):
        flat_union(n.left, out)
        flat_union(n.right, out)
    else:
        out.append(ty(n))
    return out

def call(n):
    return {
        "k": "call",
        "func": src(n.func),
        "args": [lit(a) for a in n.args],
        "kwargs": {k.arg: lit(k.value) for k in n.keywords if k.arg},
    }

def ty(n):
    if isinstance(n, ast.Constant):
        if n.value is None:
            return {"k": "none"}
        if isinstance(n.value, str):
            try:
                return ty(ast.parse(n.value, mode="eval").body)
            except SyntaxError:
                return {"k": "other", "src": n.value}
        return {"k": "const", "v": lit(n)}
    if isinstance(n, (ast.Name, ast.Attribute)):
        return {"k": "name", "id": src(n)}
    if isinstance(n, ast.BinOp) and isinstance(n.op, ast.BitOr):
        return {"k": "union", "items": flat_union(n, [])}
    if isinstance(n, ast.Subscript):
        base = src(n.value)
        args = list(n.slice.elts) if isinstance(n.slice, ast.Tuple) else [n.slice]
        last = base.split(".")[-1]
        if last == "Literal":
            return {"k": "lit", "values": [lit(a) for a in args]}
        if last == "Annotated":
            return {"k": "annotated", "type": ty(args[0]), "meta": [ty(a) for a in args[1:]]}
        return {"k": "sub", "base": base, "args": [ty(a) for a in args]}
    if isinstance(n, ast.Call):
        return call(n)
    return {"k": "other", "src": src(n)}

def config_of(v):
    if isinstance(v, ast.Call):
        return {"kwargs": {k.arg: lit(k.value) for k in v.keywords if k.arg}}
    if isinstance(v, ast.Name):
        return {"ref": v.id}
    return {"src": src(v)}

def is_type_expr(v):
    return isinstance(v, (ast.Subscript, ast.BinOp)) or (
        isinstance(v, (ast.Name, ast.Attribute)) and not isinstance(v, ast.Constant)
    )

def klass(node):
    out = {
        "name": node.name,
        "line": node.lineno,
        "bases": [src(b) for b in node.bases],
        "doc": ast.get_docstring(node),
        "fields": [],
        "members": [],
        "validators": [],
        "methods": [],
    }
    for st in node.body:
        if isinstance(st, ast.AnnAssign) and isinstance(st.target, ast.Name):
            name = st.target.id
            if name == "model_config":
                out["config"] = config_of(st.value) if st.value is not None else {}
                continue
            ann = src(st.annotation)
            if ann.startswith("ClassVar") or ann.startswith("typing.ClassVar"):
                continue
            f = {"name": name, "line": st.lineno, "type": ty(st.annotation)}
            v = st.value
            if v is not None:
                if isinstance(v, ast.Call) and src(v.func).split(".")[-1] == "Field":
                    f["field"] = call(v)
                else:
                    f["default"] = lit(v)
            out["fields"].append(f)
        elif isinstance(st, ast.Assign) and len(st.targets) == 1 and isinstance(st.targets[0], ast.Name):
            name = st.targets[0].id
            if name == "model_config":
                out["config"] = config_of(st.value)
            else:
                out["members"].append({"name": name, "value": lit(st.value)})
        elif isinstance(st, (ast.FunctionDef, ast.AsyncFunctionDef)):
            decos = [src(d) for d in st.decorator_list]
            if any("validator" in d or "serializer" in d for d in decos):
                out["validators"].append(st.name)
            else:
                out["methods"].append(st.name)
    return out

def main(path):
    with open(path, encoding="utf-8") as fh:
        tree = ast.parse(fh.read(), filename=path)
    res = {"classes": [], "aliases": {}, "configs": {}, "imports": {}}
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            res["classes"].append(klass(node))
        elif isinstance(node, ast.ImportFrom):
            for a in node.names:
                res["imports"][a.asname or a.name] = {"module": node.module or "", "name": a.name, "level": node.level}
        elif isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name, v = node.targets[0].id, node.value
            if isinstance(v, ast.Call) and src(v.func).split(".")[-1] == "ConfigDict":
                res["configs"][name] = config_of(v)["kwargs"]
            elif is_type_expr(v):
                res["aliases"][name] = ty(v)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            if src(node.annotation).split(".")[-1] == "TypeAlias":
                res["aliases"][node.target.id] = ty(node.value)
        elif type(node).__name__ == "TypeAlias":
            res["aliases"][node.name.id] = ty(node.value)
    print(json.dumps(res, default=repr))

main(sys.argv[1])
`;

export const MONGO_REPORT_SCRIPT = String.raw`
import json, os, sys

spec = json.loads(sys.stdin.read())

def done(obj):
    print(json.dumps(obj, default=str))
    sys.exit(0)

try:
    from bson import Decimal128, ObjectId
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
except ImportError as exc:
    done({"ok": False, "reason": "no-driver", "error": "pymongo bu Python ortamında yok (" + str(exc) + ")"})

import datetime

def type_name(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, int):
        return "int"
    if isinstance(v, float):
        return "float"
    if isinstance(v, str):
        return "string"
    if isinstance(v, datetime.datetime):
        return "date"
    if isinstance(v, ObjectId):
        return "objectId"
    if isinstance(v, Decimal128):
        return "decimal128"
    if isinstance(v, dict):
        return "object"
    if isinstance(v, list):
        return "array"
    return type(v).__name__

def scalar_ok(v, f):
    kind = f["kind"]
    if kind == "string":
        return isinstance(v, str)
    if kind == "number":
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            return False
        return not (f.get("int") and isinstance(v, float) and not v.is_integer())
    if kind == "boolean":
        return isinstance(v, bool)
    if kind == "date":
        return isinstance(v, datetime.datetime)
    if kind == "decimal":
        return isinstance(v, Decimal128)
    if kind == "reference":
        return isinstance(v, ObjectId)
    if kind == "enum":
        allowed = f.get("values") or []
        return (not isinstance(v, bool)) and (v in allowed)
    if kind in ("object", "map"):
        return isinstance(v, dict)
    return True

class Issues:
    def __init__(self):
        self.extra, self.missing, self.mismatch, self.soft = {}, {}, {}, {}

    def add(self, bucket, path, found=None):
        entry = bucket.setdefault(path, {"docs": set(), "types": set()})
        entry["docs"].add(self.doc_index)
        if found:
            entry["types"].add(found)

def walk(doc, shape, path, issues):
    fields = shape["fields"]
    allowed = set(shape.get("allowed") or [])
    for key, value in doc.items():
        p = path + key
        f = fields.get(key)
        if f is None:
            if key not in allowed:
                issues.add(issues.extra, p, type_name(value))
            continue
        if value is None:
            if f.get("required"):
                issues.add(issues.mismatch, p, "null")
            continue
        if f.get("isArray"):
            if not isinstance(value, list):
                issues.add(issues.mismatch, p, type_name(value))
                continue
            items = value
            item_path = p + "[]"
        else:
            items = [value]
            item_path = p
        for item in items:
            if item is None and f.get("isArray"):
                issues.add(issues.mismatch, item_path, "null")
                continue
            if not scalar_ok(item, f):
                # Pydantic (lax) still reads an ISO string as a datetime and the row's id fields are strings: no 500,
                # but date filters / sorting and reference checks / populate do not work on these documents.
                soft = isinstance(item, str) and f["kind"] in ("date", "reference")
                issues.add(issues.soft if soft else issues.mismatch, item_path, type_name(item))
                continue
            sub = f.get("object")
            if sub and isinstance(item, dict):
                walk(item, sub, item_path + ".", issues)
    for name, f in fields.items():
        if f.get("required") and name not in doc:
            issues.add(issues.missing, path + name)

def rows(bucket, expected=None):
    out = []
    for path, e in sorted(bucket.items(), key=lambda kv: (-len(kv[1]["docs"]), kv[0])):
        row = {"path": path, "docs": len(e["docs"]), "types": sorted(e["types"])}
        if expected is not None:
            row["expected"] = expected.get(path)
        out.append(row)
    return out

def expected_types(shape, path, out):
    for name, f in shape["fields"].items():
        p = path + name + ("[]" if f.get("isArray") else "")
        out[path + name] = f["kind"] + ("[]" if f.get("isArray") else "")
        out[p] = f["kind"]
        if f.get("object"):
            expected_types(f["object"], p + ".", out)
    return out

client = MongoClient(
    os.environ["GEN_MONGO_URI"],
    serverSelectionTimeoutMS=int(spec.get("timeoutMs", 3000)),
    connectTimeoutMS=int(spec.get("timeoutMs", 3000)),
)
try:
    db = client[spec["db"]]
    coll = db[spec["collection"]]
    names = db.list_collection_names()
    if spec["collection"] not in names:
        done({"ok": True, "exists": False, "total": 0, "scanned": 0, "sampled": False, "extra": [], "missing": [], "mismatched": [], "soft": []})
    total = coll.estimated_document_count()
    limit = int(spec.get("sample", 1000))
    if total > limit:
        cursor = coll.aggregate([{"$sample": {"size": limit}}])
        sampled = True
    else:
        cursor = coll.find({})
        sampled = False
    issues = Issues()
    scanned = 0
    for doc in cursor:
        issues.doc_index = scanned
        walk(doc, spec["shape"], "", issues)
        scanned += 1
    exp = expected_types(spec["shape"], "", {})
    done({
        "ok": True,
        "exists": True,
        "total": total,
        "scanned": scanned,
        "sampled": sampled,
        "extra": rows(issues.extra),
        "missing": rows(issues.missing),
        "mismatched": rows(issues.mismatch, exp),
        "soft": rows(issues.soft, exp),
    })
except PyMongoError as exc:
    done({"ok": False, "reason": "unreachable", "error": type(exc).__name__ + ": " + str(exc)[:300]})
finally:
    client.close()
`;
