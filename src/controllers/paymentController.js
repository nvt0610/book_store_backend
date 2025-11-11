import paymentService from "../services/paymentService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R=responseHelper;
const paymentsController={
  async list(req,res){try{return R.ok(res,await paymentService.list(req.query));}catch(e){return R.internalError(res,e.message);}},
  async getById(req,res){const{id}=req.params;if(!isUuid(id))return R.badRequest(res,"Invalid UUID");const row=await paymentService.getById(id,req.query.showDeleted);return row?R.ok(res,row):R.notFound(res,"Payment not found");},
  async create(req,res){try{
    const{order_id,payment_method,amount}=req.body;
    if(!isUuid(order_id))return R.badRequest(res,"Invalid order_id");
    if(!payment_method)return R.badRequest(res,"Missing payment_method");
    if(amount==null||Number(amount)<=0)return R.badRequest(res,"Invalid amount");
    const created=await paymentService.create(req.body);
    return R.created(res,created,"Payment created");
  }catch(e){return R.badRequest(res,e.message);}},
  async update(req,res){const{id}=req.params;if(!isUuid(id))return R.badRequest(res,"Invalid UUID");const updated=await paymentService.update(id,req.body);return updated?R.ok(res,updated):R.notFound(res,"Payment not found");},
  async remove(req,res){const{id}=req.params;if(!isUuid(id))return R.badRequest(res,"Invalid UUID");const ok=await paymentService.remove(id);return ok?R.ok(res,{deleted:true},"Payment soft deleted (status=INACTIVE)"):R.notFound(res,"Payment not found");}
};
export default paymentsController;
