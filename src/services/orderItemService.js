import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import paginationHelper from "../helpers/paginationHelper.js";
import queryHelper from "../helpers/queryHelper.js";
import { buildSoftDeleteScope } from "../helpers/softDeleteHelper.js";

const { parsePagination, buildPageMeta } = paginationHelper;
const { buildFiltersWhere, mergeWhereParts, buildOrderBy, buildSelectColumns } = queryHelper;

const T = {
  entity: "OrderItem",
  table: "order_items",
  alias: "oi",
  select: ["id","order_id","product_id","quantity","price","created_at","updated_at"],
  allowedFilters: ["order_id","product_id"],
  allowedSort: ["created_at"],
  mutable: ["order_id","product_id","quantity","price"],
};

function q(col){return T.alias?`${T.alias}.${col}`:col;}

const orderItemsService = {
  async list(qp={}) {
    const {page,pageSize,limit,offset}=parsePagination(qp);
    const filters=Array.isArray(qp.filters)?qp.filters:[];
    const where=buildFiltersWhere({filters,allowedColumns:T.allowedFilters,alias:T.alias});
    const soft=buildSoftDeleteScope(T.alias,qp.showDeleted||"active");
    const {whereSql,params}=mergeWhereParts([soft,where]);
    const orderBy=buildOrderBy({sortBy:qp.sortBy,sortDir:qp.sortDir,allowedSort:T.allowedSort,alias:T.alias})||`ORDER BY ${q("created_at")} DESC`;
    const cols=buildSelectColumns({alias:T.alias,columns:T.select,showDeleted:qp.showDeleted});
    const sql=`SELECT ${cols} FROM ${T.table} ${T.alias} ${whereSql} ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    const {rows}=await db.query(sql,[...params,limit,offset]);
    const {rows:count}=await db.query(`SELECT COUNT(*) AS total FROM ${T.table} ${T.alias} ${whereSql}`,params);
    return {data:rows,meta:buildPageMeta({total:Number(count[0]?.total||0),page,pageSize})};
  },
  async getById(id,showDeleted="active"){
    const soft=buildSoftDeleteScope(T.alias,showDeleted);
    const cols=buildSelectColumns({alias:T.alias,columns:T.select,showDeleted});
    const sql=`SELECT ${cols} FROM ${T.table} ${T.alias} WHERE ${q("id")}=$1 ${soft.sql?`AND ${soft.sql}`:""}`;
    const {rows}=await db.query(sql,[id]);
    return rows[0]||null;
  },
  async create(data){
    if(data.quantity<=0||data.price<0)throw new Error("Invalid quantity or price");
    const id=uuidv4();
    const cols=[],vals=[],params=[id];
    for(const col of T.mutable)if(data[col]!==undefined){cols.push(col);params.push(data[col]);vals.push(`$${params.length}`);}
    const sql=`INSERT INTO ${T.table}(id${cols.length?",":""}${cols.join(",")}) VALUES ($1${vals.length?",":""}${vals.join(",")}) RETURNING ${T.select.join(",")}`;
    const {rows}=await db.query(sql,params);
    return rows[0];
  },
  async update(id,data){
    const sets=[],params=[];
    for(const col of T.mutable)if(data[col]!==undefined){params.push(data[col]);sets.push(`${col}=$${params.length}`);}
    if(sets.length===0)return this.getById(id);
    sets.push("updated_at=now()");
    const sql=`UPDATE ${T.table} SET ${sets.join(",")} WHERE id=$${params.length+1} AND deleted_at IS NULL RETURNING ${T.select.join(",")}`;
    const {rows}=await db.query(sql,[...params,id]);
    return rows[0]||null;
  },
  async remove(id){
    const sql=`UPDATE ${T.table} SET deleted_at=now(),updated_at=now() WHERE id=$1 AND deleted_at IS NULL`;
    const {rowCount}=await db.query(sql,[id]);
    return rowCount>0;
  },
};
export default orderItemsService;
