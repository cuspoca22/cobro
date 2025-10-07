import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'isTrue', async: false })
export class IsTrue implements ValidatorConstraintInterface {
  validate(text: string, args: ValidationArguments) {
   text = text.trim().toLowerCase();
   if(text === "true") return true;
   if(text === "false") return false;
  }
  defaultMessage(args: ValidationArguments) {
    // here you can provide default error message if validation failed
    return 'No es valido';
  }
}