import { Router } from 'express';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import * as controller from './products.controller';

export const productsRouter = Router();
const canRead = requireAnyPermission('product.read', 'product.manage');

productsRouter.get('/', canRead, controller.listProducts);
productsRouter.get('/categories', canRead, controller.listCategories);
productsRouter.get('/:id', canRead, controller.getProduct);
productsRouter.post('/', requirePermission('product.manage'), controller.createProduct);
productsRouter.patch('/:id', requirePermission('product.manage'), controller.updateProduct);
