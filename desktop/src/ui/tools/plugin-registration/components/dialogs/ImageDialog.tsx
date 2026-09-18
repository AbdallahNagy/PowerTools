import { useEffect, useState } from "react";
import { Button, Checkbox, Modal, useToast } from "../../../../shared/ui";
import { useEntityAttributes } from "../../api/useEntityAttributes";
import { useImageMutations } from "../../api/useImageMutations";
import { IMAGE_TYPE_LABELS, type ImageDto, type StepDto } from "../../model/contracts";
import { problemFor, toRegistrationError } from "../../model/apiError";
import type { RegistrationProblem } from "../../model/contracts";
import {
  allowedImageTypes,
  createImageForm,
  defaultImageType,
  messagePropertyName,
  toImageDraft,
  type ImageFormState,
} from "../../model/imageForm";
import { FormField, fieldControlClass } from "./FormField";

interface ImageDialogProps {
  open: boolean;
  connectionName: string;
  step: StepDto;
  image?: ImageDto;
  onClose: () => void;
}

export function ImageDialog({
  open,
  connectionName,
  step,
  image,
  onClose,
}: ImageDialogProps) {
  const { showToast } = useToast();
  const mutations = useImageMutations(connectionName);
  const [form, setForm] = useState<ImageFormState>(() => createImageForm(image));
  const [problems, setProblems] = useState<RegistrationProblem[]>([]);
  const allowedTypes = allowedImageTypes(step.messageName, step.stage);
  const attributesQuery = useEntityAttributes(
    open ? connectionName : null,
    step.primaryEntity,
  );
  const propertyName = messagePropertyName(step.messageName) ?? "—";

  useEffect(() => {
    if (!open) return;
    const next = createImageForm(image);
    if (!image) next.imageType = defaultImageType(step);
    setForm(next);
    setProblems([]);
  }, [open, image, step]);

  const isPending = mutations.create.isPending || mutations.update.isPending;

  const save = async () => {
    setProblems([]);
    const draft = toImageDraft(form, step.id);
    try {
      if (image) await mutations.update.mutateAsync({ id: image.id, draft });
      else await mutations.create.mutateAsync(draft);
      showToast(image ? "Image updated." : "Image registered.", "success");
      onClose();
    } catch (error) {
      const parsed = toRegistrationError(error);
      setProblems(parsed.problems);
      showToast(parsed.message, "error");
    }
  };

  return (
    <Modal
      open={open}
      title={image ? "Update image" : "Register image"}
      onClose={onClose}
      widthClass="max-w-xl"
    >
      <FormField label="Name" htmlFor="image-name" problem={problemFor(problems, "name")}>
        <input
          id="image-name"
          className={fieldControlClass}
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
      </FormField>
      <FormField
        label="Entity alias"
        htmlFor="image-alias"
        problem={problemFor(problems, "entityAlias")}
      >
        <input
          id="image-alias"
          className={fieldControlClass}
          value={form.entityAlias}
          onChange={(event) =>
            setForm((current) => ({ ...current, entityAlias: event.target.value }))
          }
        />
      </FormField>
      <FormField label="Image type" htmlFor="image-type" problem={problemFor(problems, "imageType")}>
        <select
          id="image-type"
          className={fieldControlClass}
          value={form.imageType}
          onChange={(event) =>
            setForm((current) => ({ ...current, imageType: Number(event.target.value) }))
          }
        >
          {allowedTypes.map((type) => (
            <option key={type} value={type}>
              {IMAGE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Message property" htmlFor="image-property">
        <input id="image-property" className={fieldControlClass} value={propertyName} readOnly />
      </FormField>
      <FormField label="Attributes" problem={problemFor(problems, "attributes")}>
        <div className="max-h-48 overflow-auto border border-[var(--color-border-dark)] p-2 flex flex-col gap-1">
          {(attributesQuery.data ?? [])
            .filter((attribute) => !attribute.isPrimaryId)
            .map((attribute) => (
              <label key={attribute.logicalName} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.attributes.includes(attribute.logicalName)}
                  onChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      attributes: checked
                        ? [...current.attributes, attribute.logicalName]
                        : current.attributes.filter((name) => name !== attribute.logicalName),
                    }))
                  }
                />
                <span>
                  {attribute.displayName}{" "}
                  <span className="text-[var(--color-text-dark-gray)]">
                    ({attribute.logicalName})
                  </span>
                </span>
              </label>
            ))}
        </div>
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={isPending}>
          {image ? "Update" : "Register"}
        </Button>
      </div>
    </Modal>
  );
}
