import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Modal, useToast } from "../../../../shared/ui";
import { useEntityAttributes } from "../../api/useEntityAttributes";
import { useImageMutations } from "../../api/useImageMutations";
import { IMAGE_TYPE_LABELS, type ImageDto, type StepDto } from "../../model/contracts";
import { problemFor, toRegistrationError } from "../../model/apiError";
import type { RegistrationProblem } from "../../model/contracts";
import {
  attributesSummary,
  createImageForm,
  imageTypeAvailability,
  imageTypeSelectionProblem,
  toImageDraft,
  type ImageFormState,
} from "../../model/imageForm";
import { AttributePickerModal } from "./AttributePickerModal";
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
  const [form, setForm] = useState<ImageFormState>(() => createImageForm(image, step));
  const [problems, setProblems] = useState<RegistrationProblem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const availability = imageTypeAvailability(step.messageName, step.stage);
  const attributesQuery = useEntityAttributes(
    open ? connectionName : null,
    step.primaryEntity,
  );
  const attributeChoices = useMemo(
    () => (attributesQuery.data ?? []).filter((attribute) => !attribute.isPrimaryId),
    [attributesQuery.data],
  );

  useEffect(() => {
    if (!open) return;
    setForm(createImageForm(image, step));
    setProblems([]);
    setPickerOpen(false);
  }, [open, image, step]);

  const isPending = mutations.create.isPending || mutations.update.isPending;

  const save = async () => {
    const typeProblem = imageTypeSelectionProblem(form);
    if (typeProblem) {
      setProblems([typeProblem]);
      return;
    }
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
    <>
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
        <FormField label="Image type" problem={problemFor(problems, "imageType")}>
          <div className="flex flex-col gap-1">
            <label
              className={`flex items-center gap-2 text-sm ${
                availability.pre
                  ? "text-[var(--color-text-gray)]"
                  : "text-[var(--color-text-dark-gray)] cursor-not-allowed"
              }`}
            >
              <Checkbox
                checked={form.preImage}
                disabled={!availability.pre}
                onChange={(checked) => setForm((current) => ({ ...current, preImage: checked }))}
              />
              {IMAGE_TYPE_LABELS[0]}
            </label>
            <label
              className={`flex items-center gap-2 text-sm ${
                availability.post
                  ? "text-[var(--color-text-gray)]"
                  : "text-[var(--color-text-dark-gray)] cursor-not-allowed"
              }`}
            >
              <Checkbox
                checked={form.postImage}
                disabled={!availability.post}
                onChange={(checked) => setForm((current) => ({ ...current, postImage: checked }))}
              />
              {IMAGE_TYPE_LABELS[1]}
            </label>
          </div>
        </FormField>
        <FormField label="Attributes" problem={problemFor(problems, "attributes")}>
          <button
            type="button"
            className={`${fieldControlClass} text-left`}
            onClick={() => setPickerOpen(true)}
          >
            {attributesSummary(form.attributes.length)}
          </button>
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
      <AttributePickerModal
        open={open && pickerOpen}
        title="Attributes"
        attributes={attributeChoices}
        selected={form.attributes}
        isLoading={attributesQuery.isLoading}
        onChange={(attributes) => setForm((current) => ({ ...current, attributes }))}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
