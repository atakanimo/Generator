/** Id shape of the .NET host under test for the dotnet-* smokes: `ID_TYPE=objectid` (MongoDB) or uuid v7 (default). */
import { randomBytes, randomUUID } from 'node:crypto';

const objectId = process.env.ID_TYPE === 'objectid';

export const ID_LABEL = objectId ? 'ObjectId' : 'uuid v7';
export const ID_PATTERN = objectId ? /^[0-9a-f]{24}$/ : /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Token `sub` of the admin / user the smokes sign as. */
export const SUBJECT = objectId ? '65f000000000000000000001' : '0199f000-0000-7000-8000-000000000001';
/** Well-formed id of a record that does not exist. */
export const MISSING_ID = objectId ? '65f00000000000000000dead' : '0199f000-0000-7000-8000-00000000dead';
export const newId = () => (objectId ? randomBytes(12).toString('hex') : randomUUID());
